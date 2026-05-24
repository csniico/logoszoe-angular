import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { StorageCatalogService } from '../../../core/services/storage-catalog.service';
import { MigrationJob } from '../../../core/models/migration-job.model';

@Component({
  selector: 'app-migration-job',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './migration-job.html',
  styleUrl: './migration-job.scss',
})
export class MigrationJobComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly catalogService = inject(StorageCatalogService);

  job     = signal<MigrationJob | null>(null);
  loading = signal(false);
  error   = signal<string | null>(null);

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  jobId = '';

  /** Progress: only migrated + failed vs total (skipped = unprocessable, not "already done") */
  progress = computed(() => {
    const j = this.job();
    if (!j || j.total === 0) return 0;
    const done = j.migrated + j.failedCount;
    return Math.min(100, Math.round((done / j.total) * 100));
  });

  remaining = computed(() => {
    const j = this.job();
    if (!j) return 0;
    return Math.max(0, j.total - j.migrated - j.failedCount);
  });

  isActive = computed(() => {
    const s = this.job()?.status;
    return s === 'pending' || s === 'running';
  });

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadJob();

    this.pollInterval = setInterval(() => {
      if (this.isActive()) this.loadJob(true);
    }, 3000);
  }

  ngOnDestroy(): void {
    this.clearPoll();
  }

  private clearPoll(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  loadJob(silent = false): void {
    if (!silent) this.loading.set(true);
    this.catalogService.getMigrationJob(this.jobId).subscribe({
      next: (job) => {
        this.job.set(job);
        this.loading.set(false);
        if (job.status === 'completed' || job.status === 'failed') {
          this.clearPoll();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err?.error?.message ?? 'Failed to load migration job.');
        this.loading.set(false);
      },
    });
  }

  refresh(): void {
    this.loadJob();
  }

  statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  duration(job: MigrationJob): string {
    if (!job.startedAt) return '';
    const end = job.completedAt ? new Date(job.completedAt) : new Date();
    const secs = Math.round((end.getTime() - new Date(job.startedAt).getTime()) / 1000);
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}m ${s}s`;
  }

  truncateKey(key: string, max = 52): string {
    if (key.length <= max) return key;
    return '…' + key.slice(-max);
  }

  copyId(): void {
    navigator.clipboard.writeText(this.jobId).catch(() => { /* silent */ });
  }
}
