import {
  Component, inject, signal, computed, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { html as htmlBeautify } from 'js-beautify';
import { ArticleService } from '../../../core/services/article.service';
import { CategoryService } from '../../../core/services/category.service';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { HtmlEditorComponent } from '../../../shared/html-editor/html-editor';
import { BiblePassagePickerComponent } from '../../../shared/bible-passage-picker/bible-passage-picker';
import { Article, articleCat, ArticleCategory } from '../../../core/models/article.model';
import { Category } from '../../../core/models/category.model';
import { BiblePassageRef } from '../../../core/models/bible.model';
import { PipelineProgress } from '../../../core/models/pipeline.model';

type FieldName = keyof Article | 'imageUrl';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HtmlEditorComponent, BiblePassagePickerComponent],
  templateUrl: './article-detail.html',
  styleUrl: './article-detail.scss',
})
export class ArticleDetailComponent implements OnInit {
  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly articleService  = inject(ArticleService);
  private readonly categoryService = inject(CategoryService);
  private readonly storageService  = inject(StorageService);
  private readonly pipeline        = inject(DocumentPipelineService);
  private readonly sanitizer       = inject(DomSanitizer);
  private readonly confirmModal    = inject(ConfirmModalService);

  // ── Page state ────────────────────────────────────────────────
  readonly article         = signal<Article | null>(null);
  readonly relatedArticles = signal<Article[]>([]);
  readonly categories      = signal<Category[]>([]);
  readonly loading         = signal(true);
  readonly error           = signal<string | null>(null);

  // ── Field editing ─────────────────────────────────────────────
  readonly editingField = signal<string | null>(null);
  readonly draftValue   = signal<unknown>(null);
  readonly saving       = signal(false);
  readonly saveError    = signal<string | null>(null);
  readonly htmlPreview  = signal(false);

  // ── Pipeline loading state ────────────────────────────────────
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

  // ── Image upload ──────────────────────────────────────────────
  readonly uploadingImage    = signal(false);
  readonly imageUploadError  = signal<string | null>(null);
  readonly imagePreviewUrl   = signal<string | null>(null);
  pendingImageFile: File | null = null;

  // ── Computed helpers ──────────────────────────────────────────
  readonly catName = computed(() => {
    const a = this.article();
    if (!a) return '-';
    const c = articleCat(a);
    return c ? c.name : '-';
  });

  readonly catColor = computed(() => {
    const a = this.article();
    if (!a) return '#16A34A';
    const c = articleCat(a);
    return c?.color ?? '#16A34A';
  });

  readonly readTime = computed(() => {
    const body = this.article()?.content ?? '';
    return Math.max(1, Math.ceil(body.split(/\s+/).length / 200));
  });

  // ── Typed draft accessors ──────────────────────────────────────
  get draftString():   string             { return (this.draftValue() as string)             ?? ''; }
  get draftPassages(): BiblePassageRef[]  { return (this.draftValue() as BiblePassageRef[]) ?? []; }

  setDraftString(v: string):            void { this.draftValue.set(v); }
  setDraftPassages(v: BiblePassageRef[]): void { this.draftValue.set(v); }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.articleService.getBySlug(slug).subscribe({
      next: ({ article, relatedArticles }) => {
        this.article.set(article);
        this.relatedArticles.set(relatedArticles);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Article not found.');
        this.loading.set(false);
      },
    });
    this.categoryService.getAll().subscribe({
      next: (res) => this.categories.set(res.categories),
    });
  }

  // ── Field editing ─────────────────────────────────────────────
  startEdit(field: string): void {
    const art = this.article();
    if (!art) return;

    let raw: unknown = (art as any)[field];

    if (field === 'content' && typeof raw === 'string' && raw) {
      raw = htmlBeautify(raw, { indent_size: 2, wrap_line_length: 120, end_with_newline: true });
    }

    if (field === 'category') {
      const cat = articleCat(art);
      raw = cat ? cat._id : (art.category as string);
    }

    if (field === 'biblePassages') {
      raw = Array.isArray(raw) ? [...raw] : [];
    }

    this.draftValue.set(raw ?? '');
    this.editingField.set(field);
    this.saveError.set(null);
    this.htmlPreview.set(false);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.draftValue.set(null);
    this.saveError.set(null);
  }

  saveField(field: string): void {
    const art = this.article();
    if (!art) return;

    // The content field runs through the pipeline first: normalise HTML,
    // detect & fetch Bible passages, then persist both together.
    if (field === 'content') {
      this.saveContentWithPipeline(art._id);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    this.articleService.update(art._id, { [field]: this.draftValue() }).subscribe({
      next: (updated) => {
        this.article.set(updated);
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
   * Run the HTML content through the pipeline (normalise DOM, detect & fetch
   * Bible passages), then save the cleaned HTML and extracted passages together.
   * Emits stage-by-stage progress so the template can show the animated loader.
   */
  private saveContentWithPipeline(articleId: string): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.pipelineStage.set({ stage: 'normalizing', message: 'Normalising HTML structure…', progress: 0 });

    this.pipeline.processHtmlContent(this.draftString).subscribe({
      next: (progress) => {
        if (progress.stage !== 'complete') {
          this.pipelineStage.set(progress);
          return;
        }
        // Pipeline done → persist to server
        this.pipelineStage.set({ stage: 'saving', message: 'Storing…', progress: 98 });
        this.articleService
          .update(articleId, { content: progress.result ?? '', biblePassages: progress.biblePassages ?? [] })
          .subscribe({
            next: (updated) => {
              this.article.set(updated);
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

  // ── Publish toggle ────────────────────────────────────────────
  async togglePublished(): Promise<void> {
    const art = this.article();
    if (!art) return;

    const willPublish = !art.published;
    const confirmed = await this.confirmModal.open({
      intent: willPublish ? `Publish "${art.title}"?` : `Unpublish "${art.title}"?`,
      description: willPublish
        ? 'This article will become visible to all users on the platform.'
        : 'This article will be hidden from users until you publish it again.',
      confirmLabel: willPublish ? 'Publish' : 'Unpublish',
      variant: 'default',
    });
    if (!confirmed) return;

    this.saving.set(true);
    this.articleService.update(art._id, { published: willPublish }).subscribe({
      next:  (updated) => { this.article.set(updated); this.saving.set(false); },
      error: ()        => { this.saveError.set('Failed to update publish status.'); this.saving.set(false); },
    });
  }

  // ── Delete ────────────────────────────────────────────────────
  async deleteArticle(): Promise<void> {
    const art = this.article();
    if (!art) return;

    const confirmed = await this.confirmModal.open({
      intent: `Delete "${art.title}"?`,
      description: 'This will permanently remove the article and its S3 image asset. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.deleting.set(true);
    this.articleService.delete(art._id).subscribe({
      next:  () => void this.router.navigate(['/articles']),
      error: () => {
        this.saveError.set('Failed to delete article. Please try again.');
        this.deleting.set(false);
      },
    });
  }

  // ── Image upload ──────────────────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadImage(): void {
    const art  = this.article();
    const file = this.pendingImageFile;
    if (!art || !file) return;

    this.uploadingImage.set(true);
    this.imageUploadError.set(null);

    this.storageService.uploadFile(file, 'articles/images').subscribe({
      next: (presigned) => {
        this.articleService
          .update(art._id, { imageUrl: presigned.fileUrl, imageKey: presigned.fileKey })
          .subscribe({
            next: (updated) => {
              this.article.set(updated);
              this.uploadingImage.set(false);
              this.editingField.set(null);
              this.imagePreviewUrl.set(null);
              this.pendingImageFile = null;
            },
            error: () => {
              this.imageUploadError.set('Failed to update article after upload.');
              this.uploadingImage.set(false);
            },
          });
      },
      error: () => {
        this.imageUploadError.set('Upload failed. Please try again.');
        this.uploadingImage.set(false);
      },
    });
  }

  cancelImageEdit(): void {
    this.editingField.set(null);
    this.imagePreviewUrl.set(null);
    this.pendingImageFile = null;
    this.imageUploadError.set(null);
  }

  // ── HTML helpers ──────────────────────────────────────────────
  safeHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  // ── Category helpers ──────────────────────────────────────────
  catNameOf(art: Article): string {
    const c = articleCat(art);
    if (c) return c.name;
    return this.categories().find((cat) => cat._id === (art.category as string))?.name ?? '-';
  }

  catColorOf(art: Article): string {
    const c = articleCat(art);
    if (c) return c.color ?? '#16A34A';
    return this.categories().find((cat) => cat._id === (art.category as string))?.color ?? '#16A34A';
  }

  selectedCatName = computed(() => {
    const id = this.draftString;
    return this.categories().find((c) => c._id === id)?.name ?? '-';
  });

  passageVerseNum(ref: string, index: number): number {
    const m = ref.match(/:(\d+)/);
    return (m ? parseInt(m[1], 10) : 1) + index;
  }
}
