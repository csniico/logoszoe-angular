import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { DevotionalService } from '../../core/services/devotional.service';
import { SearchService } from '../../core/services/search.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Devotional, MONTH_NAMES } from '../../core/models/devotional.model';

type SortKey = 'date-desc' | 'date-asc' | 'az' | 'za';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-devotionals',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './devotionals.html',
  styleUrl: './devotionals.scss',
})
export class DevotionalsComponent implements OnInit, OnDestroy {
  private readonly devotionalService = inject(DevotionalService);
  private readonly searchService     = inject(SearchService);
  private readonly confirmModal      = inject(ConfirmModalService);
  private readonly router            = inject(Router);
  private readonly destroy$          = new Subject<void>();

  readonly MONTH_NAMES  = MONTH_NAMES;
  readonly monthOptions = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  readonly pageSize     = PAGE_SIZE;

  // ── Remote data ──────────────────────────────────────────────
  readonly devotionals   = signal<Devotional[]>([]);
  readonly loading       = signal(true);
  readonly error         = signal<string | null>(null);

  // ── Pagination ───────────────────────────────────────────────
  readonly currentPage   = signal(1);
  readonly totalPages    = signal(1);
  readonly totalItems    = signal(0);

  // ── Controls ─────────────────────────────────────────────────
  readonly viewMode      = signal<'grid' | 'table'>('grid');
  readonly searchQuery   = signal('');
  readonly filterMonth   = signal(0);
  readonly sortBy        = signal<SortKey>('date-desc');

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults    = signal<Devotional[]>([]);
  readonly searchingBackend  = signal(false);
  readonly backendSearched   = signal(false);   // true once we've fired backend search
  readonly backendTotal      = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  // ── Filtered + sorted list from current page ─────────────────
  readonly displayed = computed<Devotional[]>(() => {
    const q     = this.searchQuery().toLowerCase().trim();
    const month = this.filterMonth();
    const sort  = this.sortBy();
    let list    = this.devotionals();

    if (q) {
      list = list.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        (d.author ?? '').toLowerCase().includes(q) ||
        (d.themeScripture ?? '').toLowerCase().includes(q),
      );
    }
    if (month > 0) list = list.filter((d) => d.month === month);

    const sorted = [...list];
    if (sort === 'date-desc') sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'date-asc')  sorted.sort((a, b) => this.ts(a) - this.ts(b));
    if (sort === 'az')        sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')        sorted.sort((a, b) => b.title.localeCompare(a.title));
    return sorted;
  });

  /** True when we should show backend results instead of the empty local list */
  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  readonly hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' || this.filterMonth() !== 0,
  );

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadPage(1);

    // Debounced backend search — fires when local results are empty
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

  // ── Pagination ────────────────────────────────────────────────
  loadPage(page: number): void {
    this.loading.set(true);
    this.devotionalService.getAll(page, PAGE_SIZE).subscribe({
      next: (res) => {
        this.devotionals.set(res.data);
        this.currentPage.set(res.page);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load devotionals.'); this.loading.set(false); },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.loadPage(page);
    this.clearSearch();
  }

  // ── Search ────────────────────────────────────────────────────
  onSearchInput(q: string): void {
    this.searchQuery.set(q);
    this.backendResults.set([]);
    this.backendSearched.set(false);
    this.searchQuery$.next(q);
  }

  private runBackendSearch(q: string): void {
    this.searchingBackend.set(true);
    this.searchService.search<Devotional>(q, 'devotionals').subscribe({
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
  goToDevotional(id: string): void {
    void this.router.navigate(['/devotionals', id]);
  }

  // ── Delete ────────────────────────────────────────────────────
  async delete(id: string, title: string, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirmModal.open({
      intent: `Delete "${title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.devotionalService.delete(id).subscribe({
      next: () => {
        this.devotionals.update((devs) => devs.filter((d) => d._id !== id));
        this.totalItems.update((n) => n - 1);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  formatDate(d: Devotional): string {
    return `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year}`;
  }

  monthAbbr(d: Devotional): string {
    return MONTH_NAMES[d.month - 1]?.slice(0, 3) ?? '';
  }

  /** Strip HTML tags and decode common entities for plain-text previews. */
  stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterMonth.set(0);
    this.sortBy.set('date-desc');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }

  private clearSearch(): void {
    this.searchQuery.set('');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }

  private ts(d: Devotional): number {
    return new Date(d.year, d.month - 1, d.day).getTime();
  }
}
