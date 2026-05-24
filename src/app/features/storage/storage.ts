import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StorageCatalogService } from '../../core/services/storage-catalog.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageAsset, StorageStats, ResourceType } from '../../core/models/storage-asset.model';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-storage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './storage.html',
  styleUrl: './storage.scss',
})
export class StorageComponent implements OnInit {
  private readonly catalogService = inject(StorageCatalogService);
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
    if (!dateStr) return '—';
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
