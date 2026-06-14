import { Component, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, takeUntil } from 'rxjs';
import { ArticleService } from '../../core/services/article.service';
import { SearchService } from '../../core/services/search.service';
import { Article, ArticleCategory, articleCat } from '../../core/models/article.model';

type SortKey = 'date' | 'az' | 'za' | 'hits';
type StatusFilter = 'all' | 'published' | 'draft';

@Component({
  selector: 'app-articles',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './articles.html',
  styleUrl: './articles.scss',
})
export class ArticlesComponent implements OnInit, OnDestroy {
  private readonly articleService = inject(ArticleService);
  private readonly searchService  = inject(SearchService);
  private readonly router         = inject(Router);
  private readonly destroy$       = new Subject<void>();

  // ── Remote data ──────────────────────────────────────────────
  readonly articles = signal<Article[]>([]);
  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly viewMode         = signal<'grid' | 'table'>('grid');
  readonly searchQuery      = signal('');
  readonly filterCategoryId = signal('');
  readonly filterStatus     = signal<StatusFilter>('all');
  readonly sortBy           = signal<SortKey>('date');

  // ── Selection ─────────────────────────────────────────────────
  readonly selectedIds    = signal<Set<string>>(new Set());
  readonly bulkPublishing = signal(false);
  readonly bulkError      = signal<string | null>(null);

  /** Checkboxes only appear when drafts are visible */
  readonly canSelect = computed(() =>
    this.filterStatus() === 'draft' || this.filterStatus() === 'all',
  );

  /** IDs of currently-displayed draft articles that are selected */
  readonly selectedDraftIds = computed(() => {
    const sel = this.selectedIds();
    return this.displayed()
      .filter((a) => !a.published && sel.has(a._id))
      .map((a) => a._id);
  });

  /** True when every displayed draft is selected */
  readonly allDraftsSelected = computed(() => {
    const drafts = this.displayed().filter((a) => !a.published);
    return drafts.length > 0 && drafts.every((a) => this.selectedIds().has(a._id));
  });

  /** Any displayed draft is selected (indeterminate state) */
  readonly someDraftsSelected = computed(() =>
    this.selectedDraftIds().length > 0 && !this.allDraftsSelected(),
  );

  // ── Derived category list for the filter dropdown ─────────────
  readonly categoryOptions = computed<ArticleCategory[]>(() => {
    const seen = new Map<string, ArticleCategory>();
    for (const a of this.articles()) {
      const cat = articleCat(a);
      if (cat && !seen.has(cat._id)) seen.set(cat._id, cat);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Article[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const catId  = this.filterCategoryId();
    const status = this.filterStatus();
    const sort   = this.sortBy();

    let list = this.articles();

    if (q) {
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        this.catName(a).toLowerCase().includes(q) ||
        (a.author ?? '').toLowerCase().includes(q),
      );
    }

    if (catId) {
      list = list.filter((a) => this.catId(a) === catId);
    }

    if (status !== 'all') {
      list = list.filter((a) =>
        status === 'published' ? !!a.published : !a.published,
      );
    }

    const sorted = [...list];
    if (sort === 'az')   sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')   sorted.sort((a, b) => b.title.localeCompare(a.title));
    if (sort === 'date') sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'hits') sorted.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0));

    return sorted;
  });

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults   = signal<Article[]>([]);
  readonly searchingBackend = signal(false);
  readonly backendSearched  = signal(false);
  readonly backendTotal     = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  // ── Init: clear selection when filter changes ─────────────────
  constructor() {
    effect(() => {
      this.filterStatus();       // tracked
      this.filterCategoryId();   // tracked
      this.searchQuery();        // tracked
      this.selectedIds.set(new Set());
      this.bulkError.set(null);
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.articleService.getAll().subscribe({
      next:  (arts) => { this.articles.set(arts); this.loading.set(false); },
      error: ()     => { this.error.set('Failed to load articles.'); this.loading.set(false); },
    });

    this.searchQuery$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((q) => {
      if (q.trim() && this.displayed().length === 0) {
        this.runBackendSearch(q.trim());
      } else {
        this.backendResults.set([]);
        this.backendSearched.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Backend search ────────────────────────────────────────────
  onSearchInput(q: string): void {
    this.searchQuery.set(q);
    this.backendResults.set([]);
    this.backendSearched.set(false);
    this.searchQuery$.next(q);
  }

  private runBackendSearch(q: string): void {
    this.searchingBackend.set(true);
    this.searchService.search<Article>(q, 'articles').subscribe({
      next: (res) => {
        this.backendResults.set(res.data);
        this.backendTotal.set(res.total);
        this.backendSearched.set(true);
        this.searchingBackend.set(false);
      },
      error: () => {
        this.searchingBackend.set(false);
        this.backendSearched.set(true);
      },
    });
  }

  // ── Navigation ────────────────────────────────────────────────
  goToArticle(slug: string): void {
    void this.router.navigate(['/articles', slug]);
  }

  // ── Selection ─────────────────────────────────────────────────
  toggleSelect(id: string, event: Event): void {
    event.stopPropagation();
    this.selectedIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelectAll(): void {
    const drafts = this.displayed().filter((a) => !a.published);
    if (this.allDraftsSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(drafts.map((a) => a._id)));
    }
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkError.set(null);
  }

  // ── Bulk publish ──────────────────────────────────────────────
  bulkPublish(): void {
    const ids = this.selectedDraftIds();
    if (!ids.length) return;

    this.bulkPublishing.set(true);
    this.bulkError.set(null);

    forkJoin(ids.map((id) => this.articleService.update(id, { published: true }))).subscribe({
      next: (updated) => {
        this.articles.update((arts) =>
          arts.map((a) => updated.find((u) => u._id === a._id) ?? a),
        );
        this.selectedIds.set(new Set());
        this.bulkPublishing.set(false);
      },
      error: () => {
        this.bulkError.set('Some articles failed to publish. Please try again.');
        this.bulkPublishing.set(false);
      },
    });
  }

  // ── Category helpers ──────────────────────────────────────────
  articleCountForCat(catId: string): number {
    return this.articles().filter((a) => this.catId(a) === catId).length;
  }

  catName(art: Article): string {
    const c = articleCat(art);
    return c ? c.name : '-';
  }

  catColor(art: Article): string {
    const c = articleCat(art);
    return c?.color ?? '#16A34A';
  }

  catId(art: Article): string {
    const c = articleCat(art);
    return c ? c._id : (art.category as string);
  }

  // ── Misc helpers ──────────────────────────────────────────────
  private ts(a: Article): number {
    return a.createdAt ? new Date(a.createdAt).getTime() : 0;
  }

  passagesCount(art: Article): number {
    return art.biblePassages?.length ?? 0;
  }

  hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' ||
    this.filterCategoryId() !== '' ||
    this.filterStatus() !== 'all',
  );

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterCategoryId.set('');
    this.filterStatus.set('all');
    this.sortBy.set('date');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }
}
