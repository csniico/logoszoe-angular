import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TiktokService } from '../../core/services/tiktok.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import {
  TiktokConfigCheck,
  TiktokStatus,
  TiktokSyncResult,
  TiktokVideo,
} from '../../core/models/tiktok.model';

type VisibilityFilter = 'all' | 'visible' | 'hidden';

@Component({
  selector: 'app-tiktok',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tiktok.html',
  styleUrl: './tiktok.scss',
})
export class TiktokComponent implements OnInit {
  private readonly tiktokService = inject(TiktokService);
  private readonly authService = inject(AuthService);
  private readonly confirmModal = inject(ConfirmModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isSuperAdmin = this.authService.isSuperAdmin;

  // ── Remote data ──────────────────────────────────────────────
  readonly status = signal<TiktokStatus | null>(null);
  readonly videos = signal<TiktokVideo[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // ── Connect / OAuth ──────────────────────────────────────────
  readonly connecting = signal(false);
  readonly connectError = signal<string | null>(null);
  /** Populated from the callback's ?status= query param. */
  readonly connectResult = signal<string | null>(null);

  // ── Setup diagnostics ────────────────────────────────────────
  readonly configCheck = signal<TiktokConfigCheck | null>(null);
  readonly showDiagnostics = signal(false);

  // ── Sync ─────────────────────────────────────────────────────
  readonly syncing = signal(false);
  readonly syncResult = signal<TiktokSyncResult | null>(null);
  readonly syncError = signal<string | null>(null);

  // ── Cover refresh ────────────────────────────────────────────
  readonly refreshingCovers = signal(false);
  readonly coverResult = signal<number | null>(null);

  // ── Curation ─────────────────────────────────────────────────
  readonly updatingId = signal<string | null>(null);

  // ── Playback ─────────────────────────────────────────────────
  readonly playingVideo = signal<TiktokVideo | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly searchQuery = signal('');
  readonly filterVisibility = signal<VisibilityFilter>('all');

  readonly displayed = computed<TiktokVideo[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const vis = this.filterVisibility();

    let list = this.videos();

    if (vis === 'visible') list = list.filter((v) => v.isVisible);
    if (vis === 'hidden') list = list.filter((v) => !v.isVisible);

    if (q) {
      list = list.filter(
        (v) =>
          (v.title ?? '').toLowerCase().includes(q) ||
          (v.videoDescription ?? '').toLowerCase().includes(q) ||
          v.videoId.toLowerCase().includes(q),
      );
    }

    return list;
  });

  readonly hiddenCount = computed(
    () => this.videos().filter((v) => !v.isVisible).length,
  );

  /**
   * A cover link older than ~6 hours has expired at TikTok, so a stale count
   * here is the visible symptom of the refresh cron failing.
   */
  readonly staleCoverCount = computed(() => {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return this.videos().filter(
      (v) => !v.coverImageFetchedAt || new Date(v.coverImageFetchedAt).getTime() < cutoff,
    ).length;
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    // The backend's OAuth callback redirects here with the outcome attached.
    const params = this.route.snapshot.queryParamMap;
    const connectStatus = params.get('status');
    if (connectStatus === 'connected') {
      this.connectResult.set(
        `Connected as ${params.get('displayName') || 'your TikTok account'}.`,
      );
    } else if (connectStatus === 'error') {
      this.connectError.set(params.get('message') ?? 'Could not connect to TikTok.');
    }
    if (connectStatus) {
      // Strip the params so a refresh does not replay the banner. This uses
      // Location.replaceState rather than Router.navigate: navigating to the
      // same route re-runs ngOnInit, which would strip params and navigate
      // again - an infinite loop. replaceState rewrites the URL only.
      this.location.replaceState('/tiktok');
    }

    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.tiktokService.getStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.loading.set(false);
        // Videos only exist once an account is connected.
        if (status.connected) this.loadVideos();
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to load TikTok status.');
        this.loading.set(false);
      },
    });
  }

  private loadVideos(): void {
    this.tiktokService.getVideos(1, 50).subscribe({
      next: (res) => this.videos.set(res.data),
      error: (err) =>
        this.error.set(err?.error?.message ?? 'Failed to load TikTok videos.'),
    });
  }

  // ── Connect ───────────────────────────────────────────────────
  /**
   * Fetches the consent URL, then navigates the whole window to it. An XHR
   * cannot follow TikTok's cross-origin redirect, and the admin bearer token
   * would not survive it anyway.
   */
  connect(): void {
    if (this.connecting()) return;
    this.connecting.set(true);
    this.connectError.set(null);

    this.tiktokService.getAuthorizeUrl().subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (err) => {
        this.connectError.set(
          err?.error?.message ?? 'Could not start TikTok authorisation.',
        );
        this.connecting.set(false);
      },
    });
  }

  /**
   * TikTok reports an unregistered redirect URI as a `client_key` error on its
   * consent screen. Showing the exact URI the backend sends turns that
   * misleading message into a one-line diff against the developer portal.
   */
  toggleDiagnostics(): void {
    const next = !this.showDiagnostics();
    this.showDiagnostics.set(next);
    if (next && !this.configCheck()) {
      this.tiktokService.getConfigCheck().subscribe({
        next: (cfg) => this.configCheck.set(cfg),
        error: () => this.showDiagnostics.set(false),
      });
    }
  }

  async disconnect(): Promise<void> {
    const ok = await this.confirmModal.open({
      intent: 'Disconnect TikTok?',
      description:
        'The stored credentials will be revoked and removed. Cached videos stay, but syncing stops until an account is reconnected.',
      confirmLabel: 'Disconnect',
      variant: 'danger',
    });
    if (!ok) return;

    this.tiktokService.disconnect().subscribe({
      next: () => this.loadData(),
      error: (err) =>
        this.error.set(err?.error?.message ?? 'Failed to disconnect.'),
    });
  }

  // ── Sync ──────────────────────────────────────────────────────
  sync(full = false): void {
    if (this.syncing()) return;
    this.syncing.set(true);
    this.syncResult.set(null);
    this.syncError.set(null);

    this.tiktokService.sync(full).subscribe({
      next: (result) => {
        this.syncResult.set(result);
        this.syncing.set(false);
        this.loadData();
      },
      error: (err) => {
        this.syncError.set(err?.error?.message ?? 'Sync failed.');
        this.syncing.set(false);
      },
    });
  }

  refreshCovers(): void {
    if (this.refreshingCovers()) return;
    this.refreshingCovers.set(true);
    this.coverResult.set(null);
    this.syncError.set(null);

    this.tiktokService.refreshCovers().subscribe({
      next: ({ refreshed }) => {
        this.coverResult.set(refreshed);
        this.refreshingCovers.set(false);
        this.loadVideos();
      },
      error: (err) => {
        this.syncError.set(err?.error?.message ?? 'Cover refresh failed.');
        this.refreshingCovers.set(false);
      },
    });
  }

  // ── Curation ──────────────────────────────────────────────────
  toggleVisibility(video: TiktokVideo): void {
    if (this.updatingId()) return;
    this.updatingId.set(video.videoId);
    const next = !video.isVisible;

    this.tiktokService.setVisibility(video.videoId, next).subscribe({
      next: () => {
        this.videos.update((list) =>
          list.map((v) =>
            v.videoId === video.videoId ? { ...v, isVisible: next } : v,
          ),
        );
        this.updatingId.set(null);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Failed to update visibility.');
        this.updatingId.set(null);
      },
    });
  }

  // ── Playback ──────────────────────────────────────────────────
  play(video: TiktokVideo): void {
    if (video.embedLink) this.playingVideo.set(video);
  }

  closePlayer(): void {
    this.playingVideo.set(null);
  }

  /** TikTok's ToS requires playback through their own embed, not a raw file. */
  embedUrl(video: TiktokVideo): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(video.embedLink ?? '');
  }

  // ── Banner dismissal ──────────────────────────────────────────
  dismissSyncResult(): void {
    this.syncResult.set(null);
    this.coverResult.set(null);
  }

  dismissConnectResult(): void {
    this.connectResult.set(null);
    this.connectError.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────────
  isCoverStale(video: TiktokVideo): boolean {
    if (!video.coverImageFetchedAt) return true;
    return (
      new Date(video.coverImageFetchedAt).getTime() <
      Date.now() - 6 * 60 * 60 * 1000
    );
  }

  formatDuration(seconds?: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  formatCount(n?: number): string {
    if (n === undefined || n === null) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }
}
