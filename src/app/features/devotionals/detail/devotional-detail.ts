import { Component, computed, inject, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DevotionalService } from '../../../core/services/devotional.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { Devotional, MONTH_NAMES } from '../../../core/models/devotional.model';
import { HtmlEditorComponent } from '../../../shared/html-editor/html-editor';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { PipelineProgress } from '../../../core/models/pipeline.model';

/** Fields whose content is run through the Bible-ref detection pipeline on save. */
const PIPELINE_FIELDS = new Set([
  'oneYearBiblePlan',
  'furtherReading',
  'themeScripture',
  'content',
  'prayer',
]);

@Component({
  selector: 'app-devotional-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HtmlEditorComponent],
  templateUrl: './devotional-detail.html',
  styleUrl: './devotional-detail.scss',
})
export class DevotionalDetailComponent implements OnInit {
  private readonly route             = inject(ActivatedRoute);
  private readonly router            = inject(Router);
  private readonly devotionalService = inject(DevotionalService);
  private readonly storageService    = inject(StorageService);
  private readonly confirmModal      = inject(ConfirmModalService);
  private readonly sanitizer         = inject(DomSanitizer);
  private readonly pipeline          = inject(DocumentPipelineService);

  @ViewChild('bannerInput') bannerInputRef!: ElementRef<HTMLInputElement>;

  readonly MONTH_NAMES = MONTH_NAMES;

  // ── Page state ─────────────────────────────────────────────────
  readonly devotional  = signal<Devotional | null>(null);
  readonly loading     = signal(true);
  readonly error       = signal<string | null>(null);

  // ── Field editing ──────────────────────────────────────────────
  readonly editingField = signal<string | null>(null);
  readonly draftValue   = signal<unknown>(null);
  readonly saving       = signal(false);
  readonly saveError    = signal<string | null>(null);

  // ── Pipeline loading state ─────────────────────────────────────
  readonly pipelineStage = signal<PipelineProgress | null>(null);

  readonly pipelineSteps = [
    { id: 'detecting', label: 'Detecting'  },
    { id: 'fetching',  label: 'Fetching'   },
    { id: 'cleaning',  label: 'Cleaning'   },
    { id: 'saving',    label: 'Saving'     },
  ] as const;

  readonly pipelineStepIndex = computed(() => {
    const s = this.pipelineStage()?.stage;
    if (!s) return -1;
    if (s === 'normalizing' || s === 'processing-markup') return 0;
    if (s === 'fetching-bible') return 1;
    if (s === 'beautifying') return 2;
    if (s === 'saving' || s === 'complete') return 3;
    return -1;
  });

  // ── Delete ────────────────────────────────────────────────────
  readonly deleting = signal(false);

  // ── Thumbnail / banner image ───────────────────────────────────
  readonly uploadingBanner   = signal(false);
  readonly bannerUploadError = signal<string | null>(null);

  /** The dedicated thumbnail field is the banner. */
  bannerUrl(dev: Devotional): string | null {
    return dev.fileUrl ?? null;
  }

  triggerBannerUpload(): void {
    this.bannerUploadError.set(null);
    this.bannerInputRef.nativeElement.value = '';
    this.bannerInputRef.nativeElement.click();
  }

  onBannerFileChange(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const dev = this.devotional();
    if (!dev) return;

    this.uploadingBanner.set(true);
    this.bannerUploadError.set(null);

    this.storageService.uploadFile(file, 'devotionals/thumbnails').subscribe({
      next: (r) => {
        this.devotionalService.update(dev._id, { fileUrl: r.fileUrl, fileKey: r.fileKey }).subscribe({
          next: (d) => { this.devotional.set(d); this.uploadingBanner.set(false); },
          error: ()  => {
            this.bannerUploadError.set('Save failed. Please try again.');
            this.uploadingBanner.set(false);
          },
        });
      },
      error: () => {
        this.bannerUploadError.set('Upload failed. Please try again.');
        this.uploadingBanner.set(false);
      },
    });
  }

  // ── Accessors ─────────────────────────────────────────────────
  get draftString(): string { return (this.draftValue() as string) ?? ''; }
  get draftBool():   boolean { return !!(this.draftValue() as boolean); }

  setDraftString(v: string):  void { this.draftValue.set(v); }
  setDraftBool(v: boolean):   void { this.draftValue.set(v); }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.devotionalService.getById(id).subscribe({
      next: (dev) => { this.devotional.set(dev); this.loading.set(false); },
      error: ()   => { this.error.set('Devotional not found.'); this.loading.set(false); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  fullDate(d: Devotional): string {
    return `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year}`;
  }

  // ── Inline editing ────────────────────────────────────────────
  startEdit(field: string): void {
    const dev = this.devotional();
    if (!dev) return;

    let raw: unknown = (dev as unknown as Record<string, unknown>)[field];

    // Arrays: join to textarea lines
    if (field === 'preparatoryQuestions' || field === 'questionsToHelpYouMeditate') {
      raw = Array.isArray(raw) ? (raw as string[]).join('\n') : '';
    }

    this.draftValue.set(raw ?? '');
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.draftValue.set(null);
    this.saveError.set(null);
    this.pipelineStage.set(null);
  }

  saveField(field: string): void {
    const dev = this.devotional();
    if (!dev) return;

    // Pipeline fields — detect + fetch Bible references before persisting
    if (PIPELINE_FIELDS.has(field)) {
      this.saveWithPipeline(field, dev._id);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    let value: unknown = this.draftValue();

    // Arrays: split textarea back
    if (field === 'preparatoryQuestions' || field === 'questionsToHelpYouMeditate') {
      value = (this.draftString).split('\n').map((s) => s.trim()).filter(Boolean);
    }

    this.devotionalService.update(dev._id, { [field]: value }).subscribe({
      next: (updated) => {
        this.devotional.set(updated);
        this.saving.set(false);
        this.editingField.set(null);
      },
      error: () => {
        this.saveError.set('Save failed. Please try again.');
        this.saving.set(false);
      },
    });
  }

  /**
   * Run the draft content through the pipeline (detect & fetch Bible refs, clean HTML),
   * then persist the processed HTML and extracted passages together.
   */
  private saveWithPipeline(field: string, devotionalId: string): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.pipelineStage.set({ stage: 'normalizing', message: 'Detecting Bible references…', progress: 0 });

    this.pipeline.processHtmlContent(this.draftString).subscribe({
      next: (progress) => {
        if (progress.stage !== 'complete') {
          this.pipelineStage.set(progress);
          return;
        }
        this.pipelineStage.set({ stage: 'saving', message: 'Storing…', progress: 98 });
        this.devotionalService
          .update(devotionalId, {
            [field]: progress.result ?? this.draftString,
            biblePassages: progress.biblePassages ?? [],
          })
          .subscribe({
            next: (updated) => {
              this.devotional.set(updated);
              this.saving.set(false);
              this.editingField.set(null);
              this.pipelineStage.set(null);
            },
            error: () => {
              this.saveError.set('Save failed. Please try again.');
              this.saving.set(false);
              this.pipelineStage.set(null);
            },
          });
      },
      error: () => {
        this.saveError.set('Content processing failed. Please try again.');
        this.saving.set(false);
        this.pipelineStage.set(null);
      },
    });
  }

  // ── Published toggle ──────────────────────────────────────────
  togglePublished(): void {
    const dev = this.devotional();
    if (!dev) return;

    const willPublish = !dev.published;
    this.saving.set(true);
    this.devotionalService.update(dev._id, { published: willPublish }).subscribe({
      next:  (updated) => { this.devotional.set(updated); this.saving.set(false); },
      error: ()        => { this.saveError.set('Failed to update publish status.'); this.saving.set(false); },
    });
  }

  // ── HTML rendering ────────────────────────────────────────────
  safeHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  // ── Image gallery ─────────────────────────────────────────────
  openImage(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.closest('.gallery-item');
    if (parent) {
      (parent as HTMLElement).classList.add('gallery-item--broken');
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async deleteDevotional(): Promise<void> {
    const dev = this.devotional();
    if (!dev) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${dev.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    this.deleting.set(true);
    this.devotionalService.delete(dev._id).subscribe({
      next:  () => void this.router.navigate(['/devotionals']),
      error: () => {
        this.saveError.set('Failed to delete devotional. Please try again.');
        this.deleting.set(false);
      },
    });
  }
}
