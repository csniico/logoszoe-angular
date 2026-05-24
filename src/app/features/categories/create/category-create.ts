import {
  Component, inject, signal, computed, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CategoryService } from '../../../core/services/category.service';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { BiblePassagePickerComponent } from '../../../shared/bible-passage-picker/bible-passage-picker';
import { HtmlEditorComponent } from '../../../shared/html-editor/html-editor';
import { PipelineProgress } from '../../../core/models/pipeline.model';
import { BiblePassageRef } from '../../../core/models/bible.model';

export type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-category-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BiblePassagePickerComponent, HtmlEditorComponent],
  templateUrl: './category-create.html',
  styleUrl: './category-create.scss',
})
export class CategoryCreateComponent implements OnDestroy {
  private readonly categoryService  = inject(CategoryService);
  private readonly storageService   = inject(StorageService);
  private readonly pipeline         = inject(DocumentPipelineService);
  private readonly router           = inject(Router);

  // ── Wizard step ────────────────────────────────────────────
  readonly currentStep = signal<WizardStep>(1);

  readonly steps = [
    { id: 1 as WizardStep, label: 'Basic info' },
    { id: 2 as WizardStep, label: 'Banner' },
    { id: 3 as WizardStep, label: 'Article' },
    { id: 4 as WizardStep, label: 'Details' },
  ];

  // ── Step 1 ─────────────────────────────────────────────────
  name        = '';
  description = '';

  // ── Step 2 ─────────────────────────────────────────────────
  readonly uploadingBanner   = signal(false);
  readonly bannerUploadError = signal<string | null>(null);
  readonly bannerPreviewUrl  = signal<string | null>(null);
  bannerUrl  = '';
  bannerKey  = '';
  pendingBannerFile: File | null = null;

  // ── Step 3 ─────────────────────────────────────────────────
  articleTitle = '';
  articleBody  = '';

  readonly pipelineState    = signal<PipelineProgress | null>(null);
  readonly pipelineSub      = signal<Subscription | null>(null);
  readonly docFileName      = signal<string | null>(null);

  // ── Step 4 ─────────────────────────────────────────────────
  color      = '';
  icon       = '';
  published  = false;
  biblePassages: BiblePassageRef[] = [];

  // ── Save state ─────────────────────────────────────────────
  readonly saving     = signal(false);
  readonly saveError  = signal<string | null>(null);

  // ── Computed ───────────────────────────────────────────────
  readonly step1Valid = computed(() => this.name.trim().length > 0);

  readonly pipelineRunning = computed(() => {
    const s = this.pipelineState();
    return s !== null && s.stage !== 'complete' && s.stage !== 'error';
  });

  readonly pipelineComplete = computed(() => this.pipelineState()?.stage === 'complete');

  // ── Navigation ─────────────────────────────────────────────
  canGoNext(): boolean {
    if (this.currentStep() === 1) return this.name.trim().length > 0;
    return true;
  }

  next(): void {
    if (!this.canGoNext()) return;
    const s = this.currentStep();
    if (s < 4) this.currentStep.set((s + 1) as WizardStep);
    else this.save();
  }

  back(): void {
    const s = this.currentStep();
    if (s > 1) this.currentStep.set((s - 1) as WizardStep);
  }

  goToStep(step: WizardStep): void {
    // Only allow going back to already-visited steps
    if (step < this.currentStep()) this.currentStep.set(step);
  }

  // ── Step 2: banner upload ───────────────────────────────────
  onBannerFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingBannerFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.bannerPreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadBanner(): void {
    const file = this.pendingBannerFile;
    if (!file) return;
    this.uploadingBanner.set(true);
    this.bannerUploadError.set(null);
    this.storageService.uploadFile(file, 'categories/banner').subscribe({
      next: (r) => {
        this.bannerUrl = r.fileUrl;
        this.bannerKey = r.fileKey;
        this.uploadingBanner.set(false);
      },
      error: () => {
        this.bannerUploadError.set('Upload failed. Please try again.');
        this.uploadingBanner.set(false);
      },
    });
  }

  removeBanner(): void {
    this.bannerUrl = '';
    this.bannerKey = '';
    this.bannerPreviewUrl.set(null);
    this.pendingBannerFile = null;
  }

  // ── Step 3: document pipeline ──────────────────────────────
  onDocumentFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.docFileName.set(file.name);
    this.pipelineState.set({ stage: 'idle', message: 'Starting…' });

    const sub = this.pipeline.process(file, 'categories/content').subscribe({
      next: (state) => {
        this.pipelineState.set(state);
        if (state.stage === 'complete') {
          if (state.result) {
            this.articleBody = state.result;
          }
          if (state.biblePassages?.length) {
            // Merge extracted passages (deduplicate by ref)
            const existing = new Set(this.biblePassages.map(p => p.ref));
            const incoming = state.biblePassages.filter(p => !existing.has(p.ref));
            this.biblePassages = [...this.biblePassages, ...incoming];
          }
        }
      },
      error: () => {
        this.pipelineState.set({ stage: 'error', message: 'An unexpected error occurred.' });
      },
    });
    this.pipelineSub.set(sub);
  }

  clearDocument(): void {
    this.pipelineSub()?.unsubscribe();
    this.pipelineState.set(null);
    this.docFileName.set(null);
    this.articleBody = '';
  }

  // ── Final save ──────────────────────────────────────────────
  save(): void {
    if (!this.name.trim()) { this.currentStep.set(1); return; }
    this.saving.set(true);
    this.saveError.set(null);

    this.categoryService.create({
      name:           this.name.trim(),
      description:    this.description.trim() || undefined,
      bannerUrl:      this.bannerUrl || undefined,
      bannerKey:      this.bannerKey || undefined,
      article_title:  this.articleTitle.trim() || undefined,
      article_body:   this.articleBody || undefined,
      color:          this.color || undefined,
      icon:           this.icon || undefined,
      published:      this.published,
      biblePassages:  this.biblePassages.length ? this.biblePassages : undefined,
    } as any).subscribe({
      next: (cat) => {
        this.saving.set(false);
        void this.router.navigate(['/categories', cat._id]);
      },
      error: () => {
        this.saveError.set('Failed to create category. Please try again.');
        this.saving.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.pipelineSub()?.unsubscribe();
  }
}
