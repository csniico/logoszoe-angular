import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SubmissionService } from '../../core/services/submission.service';
import { SubmissionListItem } from '../../core/models/submission.model';

@Component({
  selector: 'app-submissions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './submissions.html',
  styleUrl: './submissions.scss',
})
export class SubmissionsComponent implements OnInit {
  private readonly submissionService = inject(SubmissionService);
  private readonly router            = inject(Router);

  // ── Remote data ───────────────────────────────────────────────
  readonly submissions = signal<SubmissionListItem[]>([]);
  readonly loading     = signal(true);
  readonly error       = signal<string | null>(null);

  // ── Controls ──────────────────────────────────────────────────
  readonly searchQuery = signal('');

  // ── Pagination ────────────────────────────────────────────────
  readonly page       = signal(1);
  readonly totalPages = signal(1);

  readonly pageNumbers = computed<number[]>(() => {
    const total = this.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  // ── Filtered list (client-side search) ────────────────────────
  readonly displayed = computed<SubmissionListItem[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.submissions();
    return this.submissions().filter((s) =>
      s.learnerName.toLowerCase().includes(q) ||
      s.learnerEmail.toLowerCase().includes(q),
    );
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.load(1);
  }

  // ── Load page ─────────────────────────────────────────────────
  load(p: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.submissionService.getAll({ page: p, limit: 20 }).subscribe({
      next: (res) => {
        this.submissions.set(res.data);
        this.page.set(res.page);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load submissions.');
        this.loading.set(false);
      },
    });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.load(p);
  }

  // ── Navigation ────────────────────────────────────────────────
  openDetail(id: string): void {
    void this.router.navigate(['/submissions', id]);
  }
}
