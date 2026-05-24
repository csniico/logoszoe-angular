import {
  Component, inject, signal, computed, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PodcastService } from '../../../core/services/podcast.service';
import { StorageService } from '../../../core/services/storage.service';
import { PODCAST_CATEGORIES, PodcastCategory } from '../../../core/models/podcast.model';

export type PodcastWizardStep = 1 | 2 | 3;

@Component({
  selector: 'app-podcast-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './podcast-create.html',
  styleUrl: './podcast-create.scss',
})
export class PodcastCreateComponent implements OnDestroy {
  private readonly podcastService = inject(PodcastService);
  private readonly storageService = inject(StorageService);
  private readonly router         = inject(Router);

  // ── Wizard step ────────────────────────────────────────────
  readonly currentStep = signal<PodcastWizardStep>(1);

  readonly steps = [
    { id: 1 as PodcastWizardStep, label: 'Basics'  },
    { id: 2 as PodcastWizardStep, label: 'Media'   },
    { id: 3 as PodcastWizardStep, label: 'Publish'  },
  ];

  // ── Categories ─────────────────────────────────────────────
  readonly categories = PODCAST_CATEGORIES;

  // ── Step 1 ─────────────────────────────────────────────────
  title       = '';
  description = '';
  category: PodcastCategory = 'podcast';

  // ── Step 2: Image ──────────────────────────────────────────
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly imagePreviewUrl  = signal<string | null>(null);
  imageUrl  = '';
  imageKey  = '';
  pendingImageFile: File | null = null;

  // ── Step 2: Audio ──────────────────────────────────────────
  readonly uploadingAudio   = signal(false);
  readonly audioUploadError = signal<string | null>(null);
  readonly audioFileName    = signal<string | null>(null);
  readonly audioDone        = signal(false);
  audioUrl  = '';
  audioKey  = '';
  pendingAudioFile: File | null = null;

  // ── Save state ─────────────────────────────────────────────
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  // ── Computed ───────────────────────────────────────────────
  readonly step1Valid = computed(() =>
    this.title.trim().length > 0 && this.description.trim().length > 0,
  );

  readonly step2Valid = computed(() => this.audioDone());

  readonly selectedCategoryLabel = computed(() =>
    PODCAST_CATEGORIES.find((c) => c.value === this.category)?.label ?? this.category,
  );

  // ── Navigation ─────────────────────────────────────────────
  canGoNext(): boolean {
    const s = this.currentStep();
    if (s === 1) return this.step1Valid();
    if (s === 2) return this.step2Valid();
    return true;
  }

  next(): void {
    if (!this.canGoNext()) return;
    const s = this.currentStep();
    if (s < 3) this.currentStep.set((s + 1) as PodcastWizardStep);
    else this.save();
  }

  back(): void {
    const s = this.currentStep();
    if (s > 1) this.currentStep.set((s - 1) as PodcastWizardStep);
  }

  goToStep(step: PodcastWizardStep): void {
    if (step < this.currentStep()) this.currentStep.set(step);
  }

  // ── Step 2: Image upload ───────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    this.imageUploadError.set(null);
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadImage(): void {
    const file = this.pendingImageFile;
    if (!file) return;
    this.uploadingImage.set(true);
    this.imageUploadError.set(null);
    this.storageService.uploadFile(file, 'podcasts/images').subscribe({
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
    this.imageUploadError.set(null);
  }

  // ── Step 2: Audio upload ───────────────────────────────────
  onAudioFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingAudioFile = file;
    this.audioFileName.set(file.name);
    this.audioDone.set(false);
    this.audioUrl = '';
    this.audioKey = '';
    this.audioUploadError.set(null);
  }

  uploadAudio(): void {
    const file = this.pendingAudioFile;
    if (!file) return;
    this.uploadingAudio.set(true);
    this.audioUploadError.set(null);
    this.storageService.uploadFile(file, 'podcasts/audio').subscribe({
      next: (r) => {
        this.audioUrl = r.fileUrl;
        this.audioKey = r.fileKey;
        this.audioDone.set(true);
        this.uploadingAudio.set(false);
      },
      error: () => {
        this.audioUploadError.set('Audio upload failed. Please try again.');
        this.uploadingAudio.set(false);
      },
    });
  }

  removeAudio(): void {
    this.audioUrl = '';
    this.audioKey = '';
    this.audioDone.set(false);
    this.audioFileName.set(null);
    this.pendingAudioFile = null;
    this.audioUploadError.set(null);
  }

  // ── Final save ─────────────────────────────────────────────
  save(): void {
    if (!this.title.trim() || !this.audioUrl) {
      this.currentStep.set(!this.title.trim() ? 1 : 2);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    this.podcastService.create({
      title:       this.title.trim(),
      description: this.description.trim(),
      category:    this.category,
      imageUrl:    this.imageUrl || undefined,
      imageKey:    this.imageKey || undefined,
      audioUrl:    this.audioUrl,
      audioKey:    this.audioKey,
    }).subscribe({
      next: (podcast) => {
        this.saving.set(false);
        void this.router.navigate(['/podcasts', podcast._id]);
      },
      error: () => {
        this.saveError.set('Failed to create podcast. Please try again.');
        this.saving.set(false);
      },
    });
  }

  ngOnDestroy(): void { /* nothing to clean up */ }
}
