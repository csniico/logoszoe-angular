import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CourseService } from '../../../core/services/course.service';
import { StorageService } from '../../../core/services/storage.service';
import {
  CourseLevel,
  COURSE_LEVELS,
} from '../../../core/models/course.model';

@Component({
  selector: 'app-course-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './course-create.html',
  styleUrl: './course-create.scss',
})
export class CourseCreateComponent {
  private readonly courseService  = inject(CourseService);
  private readonly storageService = inject(StorageService);
  private readonly router         = inject(Router);

  // ── Meta ──────────────────────────────────────────────────────────────────
  readonly levelOptions = COURSE_LEVELS;

  // ── Form fields ───────────────────────────────────────────────────────────
  title: string       = '';
  level: CourseLevel = 'foundation';
  description: string = '';

  // ── Cover image ───────────────────────────────────────────────────────────
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly imagePreviewUrl  = signal<string | null>(null);
  imageUrl = '';
  imageKey = '';
  pendingImageFile: File | null = null;

  // ── Save state ────────────────────────────────────────────────────────────
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  // ── Validation ────────────────────────────────────────────────────────────
  get formValid(): boolean {
    return this.title.trim().length > 0;
  }

  // ── Cover image ───────────────────────────────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
    this.imageUploadError.set(null);
  }

  uploadImage(): void {
    const file = this.pendingImageFile;
    if (!file) return;
    this.uploadingImage.set(true);
    this.imageUploadError.set(null);
    this.storageService.uploadFile(file, 'courses/images').subscribe({
      next: (r) => {
        this.imageUrl = r.fileUrl;
        this.imageKey = r.fileKey;
        this.uploadingImage.set(false);
      },
      error: () => {
        this.imageUploadError.set('Upload failed. Please try again.');
        this.uploadingImage.set(false);
      },
    });
  }

  removeImage(): void {
    this.imageUrl = '';
    this.imageKey = '';
    this.imagePreviewUrl.set(null);
    this.pendingImageFile = null;
  }

  // ── Final save ────────────────────────────────────────────────────────────
  save(): void {
    if (!this.formValid) return;
    this.saving.set(true);
    this.saveError.set(null);

    this.courseService.create({
      title:       this.title.trim(),
      level:       this.level,
      imageUrl:    this.imageUrl    || undefined,
      imageKey:    this.imageKey    || undefined,
      description: this.description.trim() || undefined,
    }).subscribe({
      next: (course) => {
        this.saving.set(false);
        void this.router.navigate(['/courses', course._id]);
      },
      error: () => {
        this.saveError.set('Failed to create course. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
