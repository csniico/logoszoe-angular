import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { PodcastService } from '../../core/services/podcast.service';
import { SearchService } from '../../core/services/search.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Podcast, PodcastCategory, PODCAST_CATEGORIES } from '../../core/models/podcast.model';

type SortKey = 'date' | 'az' | 'za' | 'hits';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-podcasts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './podcasts.html',
  styleUrl: './podcasts.scss',
})
export class PodcastsComponent implements OnInit, OnDestroy {
  private readonly podcastService = inject(PodcastService);
  private readonly searchService  = inject(SearchService);
  private readonly confirmModal   = inject(ConfirmModalService);
  private readonly router         = inject(Router);
  private readonly destroy$       = new Subject<void>();

  readonly pageSize = PAGE_SIZE;

  // ── Remote data ──────────────────────────────────────────────
  readonly podcasts    = signal<Podcast[]>([]);
  readonly loading     = signal(true);
  readonly error       = signal<string | null>(null);

  // ── Pagination ───────────────────────────────────────────────
  readonly currentPage = signal(1);
  readonly totalPages  = signal(1);
  readonly totalItems  = signal(0);

  // ── Controls ─────────────────────────────────────────────────
  readonly viewMode       = signal<'grid' | 'table'>('grid');
  readonly searchQuery    = signal('');
  readonly filterCategory = signal<PodcastCategory | ''>('');
  readonly sortBy         = signal<SortKey>('date');

  // ── Delete state ──────────────────────────────────────────────
  readonly deletingId = signal<string | null>(null);

  // ── Categories exposed for template ──────────────────────────
  readonly categories = PODCAST_CATEGORIES;

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Podcast[]>(() => {
    const q    = this.searchQuery().toLowerCase().trim();
    const cat  = this.filterCategory();
    const sort = this.sortBy();

    let list = this.podcasts();

    if (q) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        this.catLabel(p.category).toLowerCase().includes(q),
      );
    }

    if (cat) {
      list = list.filter((p) => p.category === cat);
    }

    const sorted = [...list];
    if (sort === 'az')   sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')   sorted.sort((a, b) => b.title.localeCompare(a.title));
    if (sort === 'date') sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'hits') sorted.sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0));

    return sorted;
  });

  readonly hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' ||
    this.filterCategory() !== '',
  );

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults   = signal<Podcast[]>([]);
  readonly searchingBackend = signal(false);
  readonly backendSearched  = signal(false);
  readonly backendTotal     = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadPage(1);

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
    this.podcastService.getAll(page, PAGE_SIZE).subscribe({
      next: (res) => {
        this.podcasts.set(res.data);
        this.currentPage.set(res.page);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load podcasts.'); this.loading.set(false); },
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.loadPage(page);
    this.searchQuery.set('');
    this.backendResults.set([]);
    this.backendSearched.set(false);
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
    this.searchService.search<Podcast>(q, 'podcasts').subscribe({
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
  goToPodcast(id: string): void {
    void this.router.navigate(['/podcasts', id]);
  }

  // ── Delete ────────────────────────────────────────────────────
  async deletePodcast(event: Event, podcast: Podcast): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirmModal.open({
      intent: `Delete "${podcast.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deletingId.set(podcast._id);
    this.podcastService.delete(podcast._id).subscribe({
      next: () => {
        this.podcasts.update((list) => list.filter((p) => p._id !== podcast._id));
        this.totalItems.update((n) => n - 1);
        this.deletingId.set(null);
      },
      error: () => {
        alert('Failed to delete podcast. Please try again.');
        this.deletingId.set(null);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  catLabel(cat: PodcastCategory | string): string {
    return PODCAST_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterCategory.set('');
    this.sortBy.set('date');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }

  private ts(p: Podcast): number {
    return p.createdAt ? new Date(p.createdAt).getTime() : 0;
  }
}
