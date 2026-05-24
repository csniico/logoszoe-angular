import {
  Component, inject, signal, computed, OnInit, SecurityContext,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { html as htmlBeautify } from 'js-beautify';
import { CategoryService } from '../../../core/services/category.service';
import { ArticleService } from '../../../core/services/article.service';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { Category } from '../../../core/models/category.model';
import { Article } from '../../../core/models/article.model';
import { HtmlEditorComponent } from '../../../shared/html-editor/html-editor';
import { BiblePassagePickerComponent } from '../../../shared/bible-passage-picker/bible-passage-picker';
import { BiblePassageRef } from '../../../core/models/bible.model';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { PipelineProgress } from '../../../core/models/pipeline.model';

type Tab = 'overview' | 'articles';
type FieldName = keyof Category;

interface SyncDiff {
  toAdd: Article[];
  toRemove: string[];
}

@Component({
  selector: 'app-category-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HtmlEditorComponent, BiblePassagePickerComponent],
  templateUrl: './category-detail.html',
  styleUrl: './category-detail.scss',
})
export class CategoryDetailComponent implements OnInit {
  private readonly route            = inject(ActivatedRoute);
  private readonly router           = inject(Router);
  private readonly categoryService  = inject(CategoryService);
  private readonly articleService   = inject(ArticleService);
  private readonly storageService   = inject(StorageService);
  private readonly pipeline         = inject(DocumentPipelineService);
  private readonly sanitizer        = inject(DomSanitizer);
  private readonly confirmModal     = inject(ConfirmModalService);

  /* ── Page state ─────────────────────────────────── */
  readonly activeTab        = signal<Tab>('overview');
  readonly category         = signal<Category | null>(null);
  readonly loadingCategory  = signal(true);

  /* ── Field editing ──────────────────────────────── */
  readonly editingField   = signal<FieldName | null>(null);
  readonly draftValue     = signal<unknown>(null);
  readonly saving         = signal(false);
  readonly saveError      = signal<string | null>(null);

  /* HTML editor preview toggle */
  readonly htmlPreview    = signal(false);

  /* ── Pipeline loading state ─────────────────────────────── */
  readonly pipelineStage  = signal<PipelineProgress | null>(null);

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

  /* ── Delete ─────────────────────────────────────── */
  readonly deleting = signal(false);

  /* ── Banner upload ──────────────────────────────── */
  readonly uploadingBanner   = signal(false);
  readonly bannerUploadError = signal<string | null>(null);
  readonly bannerPreviewUrl  = signal<string | null>(null);
  pendingBannerFile: File | null = null;

  /* ── Articles tab ───────────────────────────────── */
  readonly articles        = signal<Article[]>([]);
  readonly loadingArticles = signal(false);
  readonly syncing         = signal(false);
  readonly syncError       = signal<string | null>(null);
  readonly syncSuccess     = signal(false);

  readonly diff = computed<SyncDiff | null>(() => {
    const cat  = this.category();
    const arts = this.articles();
    if (!cat || !arts.length) return null;
    const stored = new Set<string>((cat.relatedArticles ?? []).map(String));
    const live   = new Set<string>(arts.map((a) => a._id));
    return {
      toAdd:    arts.filter((a) => !stored.has(a._id)),
      toRemove: [...stored].filter((id) => !live.has(id)),
    };
  });

  readonly hasDiff = computed(() => {
    const d = this.diff();
    return d !== null && (d.toAdd.length > 0 || d.toRemove.length > 0);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.categoryService.getById(id).subscribe({
      next:  (cat) => { this.category.set(cat); this.loadingCategory.set(false); },
      error: ()    => this.loadingCategory.set(false),
    });
  }

  /* ── Tab ────────────────────────────────────────── */
  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'articles' && this.articles().length === 0) this.fetchArticles();
  }

  /* ── Per-field edit ─────────────────────────────── */
  startEdit(field: FieldName): void {
    const cat = this.category();
    if (!cat) return;
    this.editingField.set(field);

    let raw: unknown = Array.isArray(cat[field]) ? [...(cat[field] as string[])] : cat[field];

    // Auto-format HTML for the code editor
    if (field === 'article_body' && typeof raw === 'string' && raw) {
      raw = htmlBeautify(raw, { indent_size: 2, wrap_line_length: 120, end_with_newline: true });
    }

    // Normalize any CSS color name to #rrggbb so <input type="color"> works
    if (field === 'color' && typeof raw === 'string' && raw) {
      raw = this.colorToHex(raw as string);
    }

    this.draftValue.set(raw);
    this.saveError.set(null);
    this.htmlPreview.set(false);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.draftValue.set(null);
    this.saveError.set(null);
  }

  saveField(field: FieldName): void {
    const cat = this.category();
    if (!cat) return;

    // The body field runs through the pipeline first to extract Bible passages
    // and clean up the HTML before persisting.
    if (field === 'article_body') {
      this.saveBodyWithPipeline(cat);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    this.categoryService.updateField(cat._id, { [field]: this.draftValue() }).subscribe({
      next: (updated) => {
        this.category.set(updated);
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
   * Run the HTML body through the pipeline (normalise DOM, detect & fetch Bible
   * passages), then save the cleaned HTML and the extracted passages together.
   * Emits stage-by-stage progress so the template can show the animated loader.
   */
  private saveBodyWithPipeline(cat: Category): void {
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
        this.categoryService
          .updateField(cat._id, { article_body: progress.result ?? '', biblePassages: progress.biblePassages ?? [] })
          .subscribe({
            next: (updated) => {
              this.category.set(updated);
              this.saving.set(false);
              this.editingField.set(null);
              this.pipelineStage.set(null);
              this.draftValue.set(null);
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

  /* Getters for template to read typed draft values */
  get draftString():   string           { return (this.draftValue() as string)          ?? ''; }
  get draftBool():     boolean          { return (this.draftValue() as boolean)         ?? false; }
  get draftPassages(): BiblePassageRef[] { return (this.draftValue() as BiblePassageRef[]) ?? []; }

  setDraftString(v: string):           void { this.draftValue.set(v); }
  setDraftBool(v: boolean):            void { this.draftValue.set(v); }
  setDraftPassages(v: BiblePassageRef[]): void { this.draftValue.set(v); }

  /* ── Color helpers ─────────────────────────────── */
  /** Convert any CSS color (named, rgb, hsl, hex-3) to a 6-digit #rrggbb hex. */
  private colorToHex(color: string): string {
    if (!color) return '#16A34A';
    // Already a valid 6-digit hex — return as-is
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    // Expand 3-digit shorthand
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return '#' + color.slice(1).split('').map((c) => c + c).join('');
    }
    // Use a canvas to let the browser resolve any other CSS color
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      return '#' + [r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('');
    } catch {
      return '#16A34A';
    }
  }

  /* ── Publish toggle ────────────────────────────── */
  async togglePublished(): Promise<void> {
    const cat = this.category();
    if (!cat) return;

    const willPublish = !cat.published;
    const confirmed = await this.confirmModal.open({
      intent: willPublish
        ? `Publish "${cat.name}"?`
        : `Unpublish "${cat.name}"?`,
      description: willPublish
        ? 'This category will become visible to all users on the platform.'
        : 'This category will be hidden from users until you publish it again.',
      confirmLabel: willPublish ? 'Publish' : 'Unpublish',
      variant: 'default',
    });
    if (!confirmed) return;

    this.saving.set(true);
    this.saveError.set(null);
    this.categoryService.updateField(cat._id, { published: willPublish }).subscribe({
      next:  (updated) => { this.category.set(updated); this.saving.set(false); },
      error: ()        => { this.saveError.set('Failed to update publish status.'); this.saving.set(false); },
    });
  }

  /* ── Delete category ────────────────────────────── */
  async deleteCategory(): Promise<void> {
    const cat = this.category();
    if (!cat) return;

    const hasAssets = !!(cat.bannerKey || (cat as any).imageKeys?.length);
    const confirmed = await this.confirmModal.open({
      intent: `Delete "${cat.name}"?`,
      description: hasAssets
        ? 'This will permanently delete the category and all its associated S3 assets (banner image and article images). This cannot be undone.'
        : 'This will permanently delete the category. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    this.deleting.set(true);
    this.categoryService.delete(cat._id).subscribe({
      next:  () => void this.router.navigate(['/categories']),
      error: () => {
        this.saveError.set('Failed to delete category. Please try again.');
        this.deleting.set(false);
      },
    });
  }

  /** Resolve the displayed verse number for index `i` within a passage whose ref is e.g. "Heb 2:4-5". */
  passageVerseNum(ref: string, index: number): number {
    const match = ref.match(/:(\d+)/);
    return (match ? parseInt(match[1], 10) : 1) + index;
  }

  /* ── HTML helpers ───────────────────────────────── */
  safeHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  /* ── Banner upload ──────────────────────────────── */
  onBannerFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.pendingBannerFile = file;
    // local preview
    const reader = new FileReader();
    reader.onload = (e) => this.bannerPreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadBanner(): void {
    const cat  = this.category();
    const file = this.pendingBannerFile;
    if (!cat || !file) return;

    this.uploadingBanner.set(true);
    this.bannerUploadError.set(null);

    this.storageService.uploadFile(file, `categories/banner`).subscribe({
      next: (presigned) => {
        // Update category with new URL + key
        this.categoryService
          .updateField(cat._id, { bannerUrl: presigned.fileUrl, bannerKey: presigned.fileKey })
          .subscribe({
            next: (updated) => {
              this.category.set(updated);
              this.uploadingBanner.set(false);
              this.editingField.set(null);
              this.bannerPreviewUrl.set(null);
              this.pendingBannerFile = null;
            },
            error: () => {
              this.bannerUploadError.set('Failed to update category after upload.');
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

  cancelBannerEdit(): void {
    this.editingField.set(null);
    this.bannerPreviewUrl.set(null);
    this.pendingBannerFile = null;
    this.bannerUploadError.set(null);
  }

  /* ── Articles sync ──────────────────────────────── */
  private fetchArticles(): void {
    const slug = this.category()?.slug;
    if (!slug) return;
    this.loadingArticles.set(true);
    this.articleService.getByCategorySlug(slug).subscribe({
      next:  (arts) => { this.articles.set(arts); this.loadingArticles.set(false); },
      error: ()     => this.loadingArticles.set(false),
    });
  }

  syncArticles(): void {
    const cat = this.category();
    if (!cat) return;
    this.syncing.set(true);
    this.syncError.set(null);
    this.syncSuccess.set(false);
    this.categoryService.syncArticles(cat._id, this.articles().map((a) => a._id)).subscribe({
      next: (updated) => {
        this.category.set(updated);
        this.syncing.set(false);
        this.syncSuccess.set(true);
        setTimeout(() => this.syncSuccess.set(false), 3000);
      },
      error: () => { this.syncError.set('Sync failed.'); this.syncing.set(false); },
    });
  }

  readTime(content: string): number {
    return Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
  }
}
