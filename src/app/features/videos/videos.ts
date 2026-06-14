import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { VideoService } from '../../core/services/video.service';
import { SearchService } from '../../core/services/search.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Video } from '../../core/models/video.model';

type SortKey = 'date' | 'az' | 'za';

@Component({
  selector: 'app-videos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './videos.html',
  styleUrl: './videos.scss',
})
export class VideosComponent implements OnInit, OnDestroy {
  private readonly videoService  = inject(VideoService);
  private readonly confirmModal  = inject(ConfirmModalService);
  private readonly searchService = inject(SearchService);
  private readonly router        = inject(Router);
  private readonly sanitizer     = inject(DomSanitizer);
  private readonly destroy$      = new Subject<void>();

  // ── Inline player ────────────────────────────────────────────
  readonly playingVideo = signal<Video | null>(null);

  // ── Remote data ──────────────────────────────────────────────
  readonly videos  = signal<Video[]>([]);
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly searchQuery     = signal('');
  readonly filterCategory  = signal('');
  readonly sortBy          = signal<SortKey>('date');
  readonly viewMode        = signal<'grid' | 'table'>('grid');

  // ── Derived category list ─────────────────────────────────────
  readonly categories = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const v of this.videos()) {
      if (v.category) seen.add(v.category);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  });

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Video[]>(() => {
    const q    = this.searchQuery().toLowerCase().trim();
    const cat  = this.filterCategory();
    const sort = this.sortBy();

    let list = this.videos();

    if (q) {
      list = list.filter((v) =>
        v.title.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q),
      );
    }

    if (cat) {
      list = list.filter((v) => v.category === cat);
    }

    const sorted = [...list];
    if (sort === 'date') sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'az')   sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')   sorted.sort((a, b) => b.title.localeCompare(a.title));

    return sorted;
  });

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults   = signal<Video[]>([]);
  readonly searchingBackend = signal(false);
  readonly backendSearched  = signal(false);
  readonly backendTotal     = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.videoService.getAll().subscribe({
      next:  (vids) => { this.videos.set(vids); this.loading.set(false); },
      error: ()     => { this.error.set('Failed to load videos.'); this.loading.set(false); },
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
    this.searchService.search<Video>(q, 'videos').subscribe({
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
    this.videoService.delete(id).subscribe({
      next: () => this.videos.update((list) => list.filter((v) => v._id !== id)),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  thumbUrl(youtubeId: string): string {
    return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
  }

  ytUrl(youtubeId: string): string {
    return `https://www.youtube.com/watch?v=${youtubeId}`;
  }

  // ── Inline player ──
  play(v: Video): void {
    this.playingVideo.set(v);
  }

  closePlayer(): void {
    this.playingVideo.set(null);
  }

  embedUrl(youtubeId: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    );
  }

  private ts(v: Video): number {
    return v.createdAt ? new Date(v.createdAt).getTime() : 0;
  }
}
