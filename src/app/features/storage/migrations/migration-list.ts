import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { StorageCatalogService } from '../../../core/services/storage-catalog.service';
import { MigrationJob } from '../../../core/models/migration-job.model';

@Component({
  selector: 'app-migration-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './migration-list.html',
  styleUrl: './migration-list.scss',
})
export class MigrationListComponent implements OnInit {
  private readonly catalogService = inject(StorageCatalogService);
  private readonly router = inject(Router);

  jobs    = signal<MigrationJob[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);

    this.catalogService.listMigrationJobs().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err?.error?.message ?? 'Failed to load migration jobs.');
        this.loading.set(false);
      },
    });
  }

  openJob(id: string): void {
    void this.router.navigate(['/storage/migration', id]);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  statusClass(status: string): string {
    return `status-badge status-badge--${status}`;
  }

  duration(job: MigrationJob): string {
    if (!job.startedAt || !job.completedAt) return '-';
    const secs = Math.round(
      (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000,
    );
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}m ${s}s`;
  }
}
