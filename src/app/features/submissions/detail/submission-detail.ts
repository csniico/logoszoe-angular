import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SubmissionService } from '../../../core/services/submission.service';
import { SubmissionDetail, Remark } from '../../../core/models/submission.model';

@Component({
  selector: 'app-submission-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './submission-detail.html',
  styleUrl: './submission-detail.scss',
})
export class SubmissionDetailComponent implements OnInit {
  private readonly route             = inject(ActivatedRoute);
  private readonly submissionService = inject(SubmissionService);

  // ── Data ──────────────────────────────────────────────────────
  readonly submission = signal<SubmissionDetail | null>(null);
  readonly remarks    = signal<Remark[]>([]);
  readonly loading    = signal(true);
  readonly error      = signal<string | null>(null);

  // ── Compose remark ────────────────────────────────────────────
  readonly sending = signal(false);
  remarkContent    = '';

  private get submissionId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.submissionId;
    this.submissionService.getById(id).subscribe({
      next: (res) => {
        this.submission.set(res.submission);
        this.remarks.set(res.remarks);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load submission.');
        this.loading.set(false);
      },
    });
  }

  // ── Send remark ───────────────────────────────────────────────
  sendRemark(): void {
    const content = this.remarkContent.trim();
    if (!content || this.sending()) return;

    this.sending.set(true);
    this.submissionService.addRemark(this.submissionId, content).subscribe({
      next: (remark) => {
        this.remarks.update((list) => [...list, remark]);
        this.remarkContent = '';
        this.sending.set(false);
      },
      error: () => {
        this.sending.set(false);
      },
    });
  }
}
