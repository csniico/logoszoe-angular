import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StorageCatalogService } from '../../core/services/storage-catalog.service';
import { StorageService } from '../../core/services/storage.service';
import { PodcastService } from '../../core/services/podcast.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { StorageAsset, StorageStats, ResourceType } from '../../core/models/storage-asset.model';
import { Podcast } from '../../core/models/podcast.model';
import { forkJoin, firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './storage.html',
  styleUrl: './storage.scss',
})
export class StorageComponent implements OnInit {
  private readonly catalogService = inject(StorageCatalogService);
  private readonly storageService = inject(StorageService);
  private readonly podcastService = inject(PodcastService);
  private readonly confirmModal = inject(ConfirmModalService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSuperAdmin = this.authService.isSuperAdmin;

  // State signals
  assets = signal<StorageAsset[]>([]);
  stats = signal<StorageStats | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  syncing = signal(false);
  syncResult = signal<{ synced: number; collections: string[] } | null>(null);
  syncError = signal<string | null>(null);
  migrating = signal(false);
  migrateError = signal<string | null>(null);
  // Podcast image sync
  podcastSyncing = signal(false);
  podcastSyncProgress = signal<{ done: number; total: number } | null>(null);
  podcastSyncResult = signal<{ updated: number; failed: number } | null>(null);
  podcastSyncError = signal<string | null>(null);
  filterType = signal<'all' | ResourceType>('all');
  searchQuery = signal('');
  expandedId = signal<string | null>(null);

  // Computed filtered list
  displayed = computed(() => {
    const type = this.filterType();
    const q = this.searchQuery().toLowerCase().trim();
    let list = this.assets();

    if (type !== 'all') {
      list = list.filter(a => a.resourceType === type);
    }

    if (q) {
      list = list.filter(a =>
        a.key.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        a.references.some(r => r.collection.toLowerCase().includes(q)),
      );
    }

    return list;
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      assets: this.catalogService.listAssets(),
      stats: this.catalogService.getStats(),
    }).subscribe({
      next: ({ assets, stats }) => {
        this.assets.set(assets);
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load storage data.');
        this.loading.set(false);
      },
    });
  }

  sync(): void {
    if (this.syncing()) return;
    this.syncing.set(true);
    this.syncResult.set(null);
    this.syncError.set(null);

    this.catalogService.sync().subscribe({
      next: (result) => {
        this.syncResult.set(result);
        this.syncing.set(false);
        // Reload after sync
        forkJoin({
          assets: this.catalogService.listAssets(),
          stats: this.catalogService.getStats(),
        }).subscribe({
          next: ({ assets, stats }) => {
            this.assets.set(assets);
            this.stats.set(stats);
          },
        });
      },
      error: (err) => {
        this.syncError.set(err?.error?.message ?? 'Sync failed. Please try again.');
        this.syncing.set(false);
      },
    });
  }

  // ── Podcast image sync ────────────────────────────────────────────────
  //
  // One press: list every podcast, then for each download a fresh image from
  // the same public source the Next.js audios feature uses (picsum.photos,
  // seeded by the podcast id), upload it through the storage presigned-URL
  // flow, and PATCH the podcast document with the new imageUrl/imageKey.
  // Every podcast is re-imaged, so any existing image is replaced ("cleared").

  async syncPodcastImages(): Promise<void> {
    if (this.podcastSyncing()) return;

    const ok = await this.confirmModal.open({
      intent: 'Re-generate all podcast images?',
      description:
        'This replaces every podcast’s image with a freshly generated one '
        + '(picsum.photos, seeded by podcast id), uploads it to storage, and '
        + 'updates each document. Existing images are overwritten. This cannot '
        + 'be undone.',
      confirmLabel: 'Sync images',
      variant: 'default',
    });
    if (!ok) return;

    this.podcastSyncing.set(true);
    this.podcastSyncResult.set(null);
    this.podcastSyncError.set(null);
    this.podcastSyncProgress.set(null);

    try {
      const podcasts = await this.fetchAllPodcasts();
      const total = podcasts.length;
      this.podcastSyncProgress.set({ done: 0, total });

      let updated = 0;
      let failed = 0;
      for (let i = 0; i < podcasts.length; i++) {
        try {
          await this.regeneratePodcastImage(podcasts[i]);
          updated++;
        } catch {
          failed++;
        }
        this.podcastSyncProgress.set({ done: i + 1, total });
      }

      this.podcastSyncResult.set({ updated, failed });
    } catch (err: unknown) {
      this.podcastSyncError.set(
        (err as { error?: { message?: string } })?.error?.message
        ?? 'Failed to sync podcast images. Please try again.',
      );
    } finally {
      this.podcastSyncing.set(false);
      this.podcastSyncProgress.set(null);
      this.refreshCatalog();
    }
  }

  /** Fetch every podcast across all pages (the list endpoint is paginated). */
  private async fetchAllPodcasts(): Promise<Podcast[]> {
    const first = await firstValueFrom(this.podcastService.getAll(1, 100));
    const all = [...first.data];
    for (let page = 2; page <= first.totalPages; page++) {
      const res = await firstValueFrom(this.podcastService.getAll(page, 100));
      all.push(...res.data);
    }
    return all;
  }

  /** Download a fresh image, upload via the storage flow, update the doc. */
  private async regeneratePodcastImage(p: Podcast): Promise<void> {
    // Same public source as the Next.js audios feature: picsum seeded by id.
    const url = `https://picsum.photos/seed/${encodeURIComponent(p._id)}/600/600`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `${p._id}.jpg`, {
      type: blob.type || 'image/jpeg',
    });

    const presigned = await firstValueFrom(
      this.storageService.uploadFile(file, `podcasts/${p._id}`),
    );
    await firstValueFrom(
      this.podcastService.update(p._id, {
        imageUrl: presigned.fileUrl,
        imageKey: presigned.fileKey,
      }),
    );
  }

  private refreshCatalog(): void {
    forkJoin({
      assets: this.catalogService.listAssets(),
      stats: this.catalogService.getStats(),
    }).subscribe({
      next: ({ assets, stats }) => {
        this.assets.set(assets);
        this.stats.set(stats);
      },
    });
  }

  dismissPodcastSyncResult(): void {
    this.podcastSyncResult.set(null);
    this.podcastSyncError.set(null);
  }

  setFilter(type: 'all' | ResourceType): void {
    this.filterType.set(type);
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  dismissSyncResult(): void {
    this.syncResult.set(null);
    this.syncError.set(null);
  }

  migrate(): void {
    if (this.migrating()) return;
    this.migrating.set(true);
    this.migrateError.set(null);

    this.catalogService.startMigrate().subscribe({
      next: ({ jobId }) => {
        this.migrating.set(false);
        void this.router.navigate(['/storage/migration', jobId]);
      },
      error: (err) => {
        this.migrateError.set(err?.error?.message ?? 'Failed to start migration.');
        this.migrating.set(false);
      },
    });
  }

  typeIconPath(type: ResourceType): string {
    switch (type) {
      case 'image':
        return 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z';
      case 'audio':
        return 'M9 18V5l12-2v13M9 18c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-2c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z';
      case 'video':
        return 'M15 10l4.553-2.277A1 1 0 0 1 21 8.68v6.64a1 1 0 0 1-1.447.898L15 14v-4zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z';
      case 'document':
        return 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zm0 0v6h6M16 13H8m8 4H8m2-8H8';
    }
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  truncateKey(key: string): string {
    const max = 50;
    if (key.length <= max) return key;
    const parts = key.split('/');
    const filename = parts.pop() ?? key;
    if (filename.length > max) return '…' + filename.slice(-max);
    return '…/' + filename;
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch(() => { /* silent */ });
  }
}
