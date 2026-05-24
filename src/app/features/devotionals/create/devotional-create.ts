import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DevotionalService } from '../../../core/services/devotional.service';
import { StorageService } from '../../../core/services/storage.service';
import { DevotionalPipelineService } from '../../../core/services/devotional-pipeline.service';
import { PipelineProgress } from '../../../core/models/pipeline.model';
import { ExtractedDevotional, MONTH_NAMES } from '../../../core/models/devotional.model';

export type WizardStep = 1 | 2 | 3;

@Component({
  selector: 'app-devotional-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './devotional-create.html',
  styleUrl: './devotional-create.scss',
})
export class DevotionalCreateComponent implements OnDestroy {
  private readonly devotionalService = inject(DevotionalService);
  private readonly storageService    = inject(StorageService);
  private readonly pipeline          = inject(DevotionalPipelineService);
  private readonly router            = inject(Router);

  readonly MONTH_NAMES  = MONTH_NAMES;
  readonly monthOptions = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  readonly currentYear  = new Date().getFullYear();

  // ── Wizard step ─────────────────────────────────────────────────────────────
  readonly currentStep = signal<WizardStep>(1);

  readonly steps = [
    { id: 1 as WizardStep, label: 'Date & Thumbnail' },
    { id: 2 as WizardStep, label: 'Document'          },
    { id: 3 as WizardStep, label: 'Review & Publish'  },
  ];

  // ── Step 1 fields ────────────────────────────────────────────────────────────
  day   = new Date().getDate();
  month = new Date().getMonth() + 1;
  year  = this.currentYear;

  thumbnailUrl = '';
  thumbnailKey = '';
  readonly thumbnailPreviewUrl   = signal<string | null>(null);
  readonly uploadingThumbnail    = signal(false);
  readonly thumbnailUploadError  = signal<string | null>(null);
  pendingThumbnailFile: File | null = null;

  // ── Step 2 fields ────────────────────────────────────────────────────────────
  readonly pipelineState = signal<PipelineProgress | null>(null);
  readonly pipelineSub   = signal<Subscription | null>(null);
  readonly docFileName   = signal<string | null>(null);
  title  = '';
  author = '';
  readonly extracted = signal<ExtractedDevotional | null>(null);

  // ── Step 3 fields ────────────────────────────────────────────────────────────
  published = false;

  // ── Save state ───────────────────────────────────────────────────────────────
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  // ── Validation ───────────────────────────────────────────────────────────────
  get step1Valid(): boolean {
    return this.day >= 1 && this.day <= 31 && this.month >= 1 && this.month <= 12 && this.year >= 2000;
  }

  get step2Valid(): boolean {
    const s = this.pipelineState();
    return s?.stage === 'complete' && this.title.trim().length > 0;
  }

  get pipelineRunning(): boolean {
    const s = this.pipelineState();
    return s !== null && s.stage !== 'complete' && s.stage !== 'error';
  }

  get pipelineComplete(): boolean {
    return this.pipelineState()?.stage === 'complete';
  }

  get formattedDate(): string {
    if (this.month < 1 || this.month > 12) return '—';
    return `${this.day} ${MONTH_NAMES[this.month - 1]} ${this.year}`;
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  canGoNext(): boolean {
    if (this.currentStep() === 1) return this.step1Valid;
    if (this.currentStep() === 2) return this.step2Valid;
    return true;
  }

  next(): void {
    if (!this.canGoNext()) return;
    const s = this.currentStep();
    if (s < 3) this.currentStep.set((s + 1) as WizardStep);
    else this.save();
  }

  back(): void {
    const s = this.currentStep();
    if (s > 1) this.currentStep.set((s - 1) as WizardStep);
  }

  goToStep(step: WizardStep): void {
    if (step < this.currentStep()) this.currentStep.set(step);
  }

  // ── Step 1: thumbnail ────────────────────────────────────────────────────────
  onThumbnailFileChange(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingThumbnailFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => this.thumbnailPreviewUrl.set(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadThumbnail(): void {
    const file = this.pendingThumbnailFile;
    if (!file) return;
    this.uploadingThumbnail.set(true);
    this.thumbnailUploadError.set(null);
    this.storageService.uploadFile(file, 'devotionals/thumbnails').subscribe({
      next: (r) => {
        this.thumbnailUrl = r.fileUrl;
        this.thumbnailKey = r.fileKey;
        this.uploadingThumbnail.set(false);
      },
      error: () => {
        this.thumbnailUploadError.set('Upload failed. Please try again.');
        this.uploadingThumbnail.set(false);
      },
    });
  }

  removeThumbnail(): void {
    this.thumbnailUrl = '';
    this.thumbnailKey = '';
    this.thumbnailPreviewUrl.set(null);
    this.pendingThumbnailFile = null;
    this.thumbnailUploadError.set(null);
  }

  // ── Step 2: document ─────────────────────────────────────────────────────────
  onDocumentFileChange(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.docFileName.set(file.name);
    this.pipelineState.set({ stage: 'idle', message: 'Starting…' });

    const sub = this.pipeline.process(file).subscribe({
      next: (state) => {
        this.pipelineState.set(state);
        if (state.stage === 'complete' && state.extracted) {
          this.extracted.set(state.extracted);
          if (!this.title)  this.title  = state.extracted.title;
          if (!this.author) this.author = state.extracted.author;
        }
      },
      error: () => this.pipelineState.set({ stage: 'error', message: 'An unexpected error occurred.' }),
    });
    this.pipelineSub.set(sub);
  }

  clearDocument(): void {
    this.pipelineSub()?.unsubscribe();
    this.pipelineState.set(null);
    this.docFileName.set(null);
    this.extracted.set(null);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  save(): void {
    if (!this.title.trim()) { this.currentStep.set(2); return; }
    this.saving.set(true);
    this.saveError.set(null);

    const ext = this.extracted();
    const payload = {
      day:   this.day,
      month: this.month,
      year:  this.year,
      title: this.title.trim(),
      author:                     this.author.trim() || undefined,
      themeScripture:             ext?.themeScripture || undefined,
      preparatoryQuestions:       ext?.preparatoryQuestions?.length ? ext.preparatoryQuestions : undefined,
      content:                    ext?.content || undefined,
      furtherReading:             ext?.furtherReading || undefined,
      questionsToHelpYouMeditate: ext?.questionsToHelpYouMeditate?.length ? ext.questionsToHelpYouMeditate : undefined,
      prayer:                     ext?.prayer || undefined,
      oneYearBiblePlan:           ext?.oneYearBiblePlan || undefined,
      fileUrl:                    this.thumbnailUrl  || undefined,
      fileKey:                    this.thumbnailKey  || undefined,
      listOfImageAssets:          ext?.listOfImageAssets?.length ? ext.listOfImageAssets : undefined,
      biblePassages:              ext?.biblePassages?.length ? ext.biblePassages : undefined,
      published: this.published,
    };

    this.devotionalService.create(payload).subscribe({
      next:  (d)  => { this.saving.set(false); void this.router.navigate(['/devotionals', d._id]); },
      error: ()   => { this.saveError.set('Failed to create devotional. Please try again.'); this.saving.set(false); },
    });
  }

  ngOnDestroy(): void {
    this.pipelineSub()?.unsubscribe();
  }
}
