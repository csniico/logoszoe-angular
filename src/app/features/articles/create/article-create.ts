import {
  Component, inject, signal, computed, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ArticleService } from '../../../core/services/article.service';
import { CategoryService } from '../../../core/services/category.service';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { HtmlEditorComponent } from '../../../shared/html-editor/html-editor';
import { PipelineProgress } from '../../../core/models/pipeline.model';
import { BiblePassageRef } from '../../../core/models/bible.model';
import { Article } from '../../../core/models/article.model';
import { Category } from '../../../core/models/category.model';

export type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-article-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HtmlEditorComponent],
  templateUrl: './article-create.html',
  styleUrl: './article-create.scss',
})
export class ArticleCreateComponent implements OnDestroy {
  private readonly articleService  = inject(ArticleService);
  private readonly categoryService = inject(CategoryService);
  private readonly storageService  = inject(StorageService);
  private readonly pipeline        = inject(DocumentPipelineService);
  private readonly router          = inject(Router);

  // ── Wizard step ────────────────────────────────────────────
  readonly currentStep = signal<WizardStep>(1);

  readonly steps = [
    { id: 1 as WizardStep, label: 'Basics' },
    { id: 2 as WizardStep, label: 'Cover image' },
    { id: 3 as WizardStep, label: 'Content' },
    { id: 4 as WizardStep, label: 'Publish' },
  ];

  // ── Step 1 ─────────────────────────────────────────────────
  title      = '';
  categoryId = '';
  author     = '';

  // ── Step 2 ─────────────────────────────────────────────────
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly imagePreviewUrl  = signal<string | null>(null);
  imageUrl  = '';
  imageKey  = '';
  pendingImageFile: File | null = null;

  // ── Step 3 ─────────────────────────────────────────────────
  readonly contentMode = signal<'upload' | 'editor'>('upload');
  content = '';

  readonly pipelineState = signal<PipelineProgress | null>(null);
  readonly pipelineSub   = signal<Subscription | null>(null);
  readonly docFileName   = signal<string | null>(null);
  biblePassages: BiblePassageRef[] = [];

  // ── Step 4 ─────────────────────────────────────────────────
  published = false;

  // ── Save state ─────────────────────────────────────────────
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  // ── Categories ─────────────────────────────────────────────
  readonly categories = signal<Category[]>([]);

  constructor() {
    this.categoryService.getAll().subscribe({
      next: (res) => this.categories.set(res.categories),
      error: () => { /* non-fatal - dropdown will be empty */ },
    });
  }

  // ── Computed ───────────────────────────────────────────────
  readonly step1Valid = computed(() => this.title.trim().length > 0);

  readonly pipelineRunning = computed(() => {
    const s = this.pipelineState();
    return s !== null && s.stage !== 'complete' && s.stage !== 'error';
  });

  readonly pipelineComplete = computed(() => this.pipelineState()?.stage === 'complete');

  readonly selectedCategoryName = computed(() => {
    if (!this.categoryId) return 'None';
    return this.categories().find(c => c._id === this.categoryId)?.name ?? 'None';
  });

  // ── Navigation ─────────────────────────────────────────────
  canGoNext(): boolean {
    if (this.currentStep() === 1) return this.title.trim().length > 0;
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
    if (step < this.currentStep()) this.currentStep.set(step);
  }

  // ── Step 2: image upload ────────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadImage(): void {
    const file = this.pendingImageFile;
    if (!file) return;
    this.uploadingImage.set(true);
    this.imageUploadError.set(null);
    this.storageService.uploadFile(file, 'articles/images').subscribe({
      next: (r) => {
        this.imageUrl = r.fileUrl;
        this.imageKey = r.fileKey;
        this.uploadingImage.set(false);
      },
      error: () => {
        this.imageUploadError.set('Upload failed. Please try again.');
        this.uploadingImage.set(false);
      },
    });
  }

  removeImage(): void {
    this.imageUrl = '';
    this.imageKey = '';
    this.imagePreviewUrl.set(null);
    this.pendingImageFile = null;
  }

  // ── Step 3: document pipeline ───────────────────────────────
  onDocumentFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.docFileName.set(file.name);
    this.pipelineState.set({ stage: 'idle', message: 'Starting…' });

    const sub = this.pipeline.process(file, 'articles/content').subscribe({
      next: (state) => {
        this.pipelineState.set(state);
        if (state.stage === 'complete') {
          if (state.result) {
            this.content = state.result;
          }
          if (state.biblePassages?.length) {
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
    this.content = '';
  }

  // ── Final save ──────────────────────────────────────────────
  save(): void {
    if (!this.title.trim()) { this.currentStep.set(1); return; }
    this.saving.set(true);
    this.saveError.set(null);

    const payload: Partial<Article> & { title: string } = {
      title:         this.title.trim(),
      category:      this.categoryId || undefined,
      author:        this.author.trim() || undefined,
      imageUrl:      this.imageUrl || undefined,
      imageKey:      this.imageKey || undefined,
      content:       this.content || undefined,
      published:     this.published,
      biblePassages: this.biblePassages.length ? (this.biblePassages as any) : undefined,
    };

    this.articleService.create(payload).subscribe({
      next: (article) => {
        this.saving.set(false);
        void this.router.navigate(['/articles', article.slug]);
      },
      error: () => {
        this.saveError.set('Failed to create article. Please try again.');
        this.saving.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.pipelineSub()?.unsubscribe();
  }
}
