import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { VideoService } from '../../../core/services/video.service';

@Component({
  selector: 'app-video-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './video-create.html',
  styleUrl: './video-create.scss',
})
export class VideoCreateComponent {
  private readonly videoService = inject(VideoService);
  private readonly router       = inject(Router);

  // ── Categories (sourced from the videos collection) ───────────
  readonly CATEGORIES: { value: string; label: string }[] = [
    { value: 'inspirational',      label: 'Inspirational'      },
    { value: 'motivationals',      label: 'Motivationals'      },
    { value: 'testimony-of-jesus', label: 'Testimony of Jesus' },
    { value: 'wisdom-nuggets',     label: 'Wisdom Nuggets'     },
  ];

  // ── Form state ────────────────────────────────────────────────
  youtubeId   = '';
  title       = '';
  description = '';
  category    = '';

  readonly saving = signal(false);
  readonly error  = signal<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────
  get youtubeThumbnail(): string | null {
    const id = this.youtubeId.trim();
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  }

  get formValid(): boolean {
    return (
      this.youtubeId.trim().length > 0 &&
      this.title.trim().length > 0 &&
      this.description.trim().length > 0 &&
      this.category.trim().length > 0
    );
  }

  // ── Save ──────────────────────────────────────────────────────
  save(): void {
    if (!this.formValid) return;
    this.saving.set(true);
    this.error.set(null);

    this.videoService.create({
      youtubeId:    this.youtubeId.trim(),
      title:        this.title.trim(),
      description:  this.description.trim(),
      category:     this.category.trim(),
      thumbnailUrl: `https://img.youtube.com/vi/${this.youtubeId.trim()}/mqdefault.jpg`,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/videos']);
      },
      error: () => {
        this.error.set('Failed to create video. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
