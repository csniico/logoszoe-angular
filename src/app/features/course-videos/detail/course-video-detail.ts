import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CourseVideoService } from '../../../core/services/course-video.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { CourseVideo } from '../../../core/models/course-video.model';

@Component({
  selector: 'app-course-video-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './course-video-detail.html',
  styleUrl: './course-video-detail.scss',
})
export class CourseVideoDetailComponent implements OnInit {
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly svc          = inject(CourseVideoService);
  private readonly confirmModal = inject(ConfirmModalService);

  readonly video   = signal<CourseVideo | null>(null);
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  // ── Edit metadata ─────────────────────────────────────────────
  readonly editingField = signal<'title' | 'description' | null>(null);
  readonly saving       = signal(false);
  readonly saveError    = signal<string | null>(null);

  editTitle       = '';
  editDescription = '';

  // ── Delete ────────────────────────────────────────────────────
  readonly deleting = signal(false);

  private get videoId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  ngOnInit(): void {
    this.svc.getById(this.videoId).subscribe({
      next:  (v) => { this.video.set(v); this.loading.set(false); },
      error: ()  => { this.error.set('Failed to load video.'); this.loading.set(false); },
    });
  }

  // ── Field editing ─────────────────────────────────────────────
  startEdit(field: 'title' | 'description'): void {
    const v = this.video();
    if (!v) return;
    if (field === 'title')       this.editTitle = v.title;
    if (field === 'description') this.editDescription = v.description ?? '';
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEdit(): void {
    this.editingField.set(null);
  }

  saveField(field: 'title' | 'description'): void {
    const v = this.video();
    if (!v) return;

    const patch = field === 'title'
      ? { title: this.editTitle.trim() }
      : { title: v.title, description: this.editDescription.trim() || undefined };

    if (field === 'title' && !patch.title) return;

    this.saving.set(true);
    this.saveError.set(null);

    this.svc.update(v._id, patch as any).subscribe({
      next: (updated) => {
        this.video.set(updated);
        this.editingField.set(null);
        this.saving.set(false);
      },
      error: () => {
        this.saveError.set('Failed to save. Try again.');
        this.saving.set(false);
      },
    });
  }

  // ── Delete ────────────────────────────────────────────────────
  async deleteVideo(): Promise<void> {
    const v = this.video();
    if (!v) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${v.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deleting.set(true);
    this.svc.delete(v._id).subscribe({
      next: () => void this.router.navigate(['/course-videos']),
      error: () => { alert('Failed to delete.'); this.deleting.set(false); },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  formatDuration(sec?: number): string {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m > 0 ? m + 'm ' : ''}${s > 0 ? s + 's' : ''}`.trim();
    if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
    return `${s}s`;
  }
}
