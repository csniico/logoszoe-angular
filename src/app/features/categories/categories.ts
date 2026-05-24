import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { CategoryService } from '../../core/services/category.service';
import { SearchService } from '../../core/services/search.service';
import { Category } from '../../core/models/category.model';

type SortKey = 'az' | 'za' | 'date' | 'articles';
type StatusFilter = 'all' | 'published' | 'draft';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class CategoriesComponent implements OnInit, OnDestroy {
  private readonly categoryService = inject(CategoryService);
  private readonly searchService   = inject(SearchService);
  private readonly router          = inject(Router);
  private readonly destroy$        = new Subject<void>();

  // ── Remote data ──────────────────────────────────────────────
  readonly categories = signal<Category[]>([]);
  readonly loading    = signal(true);
  readonly error      = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly searchQuery  = signal('');
  readonly filterStatus = signal<StatusFilter>('all');
  readonly sortBy       = signal<SortKey>('az');
  readonly viewMode     = signal<'grid' | 'table'>('grid');

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Category[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const status = this.filterStatus();
    const sort   = this.sortBy();

    let list = this.categories();

    if (q) {
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
      );
    }

    if (status !== 'all') {
      list = list.filter((c) =>
        status === 'published' ? !!c.published : !c.published,
      );
    }

    const sorted = [...list];
    if (sort === 'az')       sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'za')       sorted.sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'date')     sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'articles') sorted.sort((a, b) => (b.relatedArticles?.length ?? 0) - (a.relatedArticles?.length ?? 0));

    return sorted;
  });

  readonly hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' || this.filterStatus() !== 'all',
  );

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults   = signal<Category[]>([]);
  readonly searchingBackend = signal(false);
  readonly backendSearched  = signal(false);
  readonly backendTotal     = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.categoryService.getAll().subscribe({
      next:  (res) => { this.categories.set(res.categories); this.loading.set(false); },
      error: ()    => { this.error.set('Failed to load categories.'); this.loading.set(false); },
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
    this.searchService.search<Category>(q, 'categories').subscribe({
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
  goToDetail(id: string): void {
    void this.router.navigate(['/categories', id]);
  }

  // ── Helpers ───────────────────────────────────────────────────
  articleCount(cat: Category): number {
    return cat.relatedArticles?.length ?? 0;
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterStatus.set('all');
    this.sortBy.set('az');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }

  private ts(c: Category): number {
    return c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
  }
}
