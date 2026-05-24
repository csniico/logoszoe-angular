import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CourseVideoService } from '../../core/services/course-video.service';
import { StorageService } from '../../core/services/storage.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { CourseVideo } from '../../core/models/course-video.model';

@Component({
  selector: 'app-course-videos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './course-videos.html',
  styleUrl: './course-videos.scss',
})
export class CourseVideosComponent implements OnInit, OnDestroy {
  private readonly svc          = inject(CourseVideoService);
  private readonly storage      = inject(StorageService);
  private readonly confirmModal = inject(ConfirmModalService);

  readonly videos        = signal<CourseVideo[]>([]);
  readonly loading       = signal(true);
  readonly error         = signal<string | null>(null);
  readonly showUpload    = signal(false);

  // Upload form state
  newTitle       = '';
  newDescription = '';
  readonly uploadingVideo = signal(false);
  readonly uploadingThumb = signal(false);
  readonly uploadError    = signal<string | null>(null);
  readonly uploadProgress = signal<string | null>(null);

  pendingVideoFile: File | null = null;
  pendingThumbFile: File | null = null;

  // Local object URLs for previewing picked files (revoked on reset / destroy)
  readonly videoPreviewUrl = signal<string | null>(null);
  readonly thumbPreviewUrl = signal<string | null>(null);

  readonly deletingId = signal<string | null>(null);

  ngOnInit(): void {
    this.svc.getAll().subscribe({
      next:  (vs) => { this.videos.set(vs); this.loading.set(false); },
      error: ()   => { this.error.set('Failed to load course videos.'); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void {
    this.revokeObjectUrls();
  }

  onVideoFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.pendingVideoFile = file;
    this.revokeVideoUrl();
    if (file) this.videoPreviewUrl.set(URL.createObjectURL(file));
  }

  onThumbFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.pendingThumbFile = file;
    this.revokeThumbUrl();
    if (file) this.thumbPreviewUrl.set(URL.createObjectURL(file));
  }

  upload(): void {
    if (!this.pendingVideoFile || !this.newTitle.trim()) return;
    this.uploadingVideo.set(true);
    this.uploadError.set(null);
    this.uploadProgress.set('Uploading video…');

    this.storage.uploadFile(this.pendingVideoFile, 'course-videos').subscribe({
      next: (videoRes) => {
        const thumbFile = this.pendingThumbFile;
        if (thumbFile) {
          this.uploadProgress.set('Uploading thumbnail…');
          this.storage.uploadFile(thumbFile, 'course-video-thumbs').subscribe({
            next: (thumbRes) => this.saveRecord(videoRes.fileUrl, videoRes.fileKey, thumbRes.fileUrl, thumbRes.fileKey),
            error: () => this.saveRecord(videoRes.fileUrl, videoRes.fileKey),
          });
        } else {
          this.saveRecord(videoRes.fileUrl, videoRes.fileKey);
        }
      },
      error: () => {
        this.uploadError.set('Video upload failed. Please try again.');
        this.uploadingVideo.set(false);
        this.uploadProgress.set(null);
      },
    });
  }

  private saveRecord(videoUrl: string, videoKey: string, thumbnailUrl?: string, thumbnailKey?: string): void {
    this.uploadProgress.set('Saving…');
    this.svc.create({
      title: this.newTitle.trim(),
      description: this.newDescription.trim() || undefined,
      videoUrl, videoKey, thumbnailUrl, thumbnailKey,
    }).subscribe({
      next: (v) => {
        this.videos.update((vs) => [v, ...vs]);
        this.resetUploadForm();
        this.uploadingVideo.set(false);
        this.uploadProgress.set(null);
        this.showUpload.set(false);
      },
      error: () => {
        this.uploadError.set('Failed to save video record.');
        this.uploadingVideo.set(false);
        this.uploadProgress.set(null);
      },
    });
  }

  private resetUploadForm(): void {
    this.newTitle = '';
    this.newDescription = '';
    this.pendingVideoFile = null;
    this.pendingThumbFile = null;
    this.uploadError.set(null);
    this.revokeObjectUrls();
  }

  cancelUpload(): void {
    this.resetUploadForm();
    this.showUpload.set(false);
  }

  async delete(id: string, title: string): Promise<void> {
    const ok = await this.confirmModal.open({
      intent: `Delete "${title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deletingId.set(id);
    this.svc.delete(id).subscribe({
      next: () => { this.videos.update((vs) => vs.filter((v) => v._id !== id)); this.deletingId.set(null); },
      error: () => { alert('Failed to delete.'); this.deletingId.set(null); },
    });
  }

  formatDuration(sec?: number): string {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
    if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
    return `${s}s`;
  }

  // ── Object URL helpers ────────────────────────────────────────
  private revokeVideoUrl(): void {
    const url = this.videoPreviewUrl();
    if (url) { URL.revokeObjectURL(url); this.videoPreviewUrl.set(null); }
  }

  private revokeThumbUrl(): void {
    const url = this.thumbPreviewUrl();
    if (url) { URL.revokeObjectURL(url); this.thumbPreviewUrl.set(null); }
  }

  private revokeObjectUrls(): void {
    this.revokeVideoUrl();
    this.revokeThumbUrl();
  }
}
