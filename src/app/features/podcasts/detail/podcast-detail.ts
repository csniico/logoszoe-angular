import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PodcastService } from '../../../core/services/podcast.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { Podcast, PodcastCategory, PODCAST_CATEGORIES } from '../../../core/models/podcast.model';

@Component({
  selector: 'app-podcast-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './podcast-detail.html',
  styleUrl: './podcast-detail.scss',
})
export class PodcastDetailComponent implements OnInit {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly podcastService = inject(PodcastService);
  private readonly storageService = inject(StorageService);
  private readonly confirmModal   = inject(ConfirmModalService);

  // ── Page state ────────────────────────────────────────────────
  readonly podcast  = signal<Podcast | null>(null);
  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);

  // ── Field editing ─────────────────────────────────────────────
  readonly editingField = signal<string | null>(null);
  readonly draftValue   = signal<unknown>(null);
  readonly saving       = signal(false);
  readonly saveError    = signal<string | null>(null);

  // ── Delete ────────────────────────────────────────────────────
  readonly deleting = signal(false);

  // ── Image upload ──────────────────────────────────────────────
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly imagePreviewUrl  = signal<string | null>(null);
  pendingImageFile: File | null = null;

  // ── Exposed for template ─────────────────────────────────────
  readonly categories = PODCAST_CATEGORIES;

  // ── Computed helpers ──────────────────────────────────────────
  readonly catLabel = computed(() => {
    const p = this.podcast();
    if (!p) return '—';
    return PODCAST_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category;
  });

  get draftString(): string { return (this.draftValue() as string) ?? ''; }
  setDraftString(v: string): void { this.draftValue.set(v); }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.podcastService.getById(id).subscribe({
      next: (pod) => {
        this.podcast.set(pod);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Podcast not found.');
        this.loading.set(false);
      },
    });
  }

  // ── Field editing ─────────────────────────────────────────────
  startEdit(field: string): void {
    const p = this.podcast();
    if (!p) return;
    this.draftValue.set((p as any)[field] ?? '');
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.draftValue.set(null);
    this.saveError.set(null);
  }

  saveField(field: string): void {
    const p = this.podcast();
    if (!p) return;
    this.saving.set(true);
    this.saveError.set(null);

    this.podcastService.update(p._id, { [field]: this.draftValue() }).subscribe({
      next: (updated) => {
        this.podcast.set(updated);
        this.saving.set(false);
        this.editingField.set(null);
      },
      error: () => {
        this.saveError.set('Save failed. Please try again.');
        this.saving.set(false);
      },
    });
  }

  // ── Delete ────────────────────────────────────────────────────
  async deletePodcast(): Promise<void> {
    const p = this.podcast();
    if (!p) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${p.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    this.deleting.set(true);
    this.podcastService.delete(p._id).subscribe({
      next:  () => void this.router.navigate(['/podcasts']),
      error: () => {
        this.saveError.set('Failed to delete podcast. Please try again.');
        this.deleting.set(false);
      },
    });
  }

  // ── Image upload ──────────────────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadImage(): void {
    const p    = this.podcast();
    const file = this.pendingImageFile;
    if (!p || !file) return;

    this.uploadingImage.set(true);
    this.imageUploadError.set(null);

    this.storageService.uploadFile(file, 'podcasts/images').subscribe({
      next: (presigned) => {
        this.podcastService
          .update(p._id, { imageUrl: presigned.fileUrl, imageKey: presigned.fileKey })
          .subscribe({
            next: (updated) => {
              this.podcast.set(updated);
              this.uploadingImage.set(false);
              this.editingField.set(null);
              this.imagePreviewUrl.set(null);
              this.pendingImageFile = null;
            },
            error: () => {
              this.imageUploadError.set('Failed to update podcast after upload.');
              this.uploadingImage.set(false);
            },
          });
      },
      error: () => {
        this.imageUploadError.set('Upload failed. Please try again.');
        this.uploadingImage.set(false);
      },
    });
  }

  cancelImageEdit(): void {
    this.editingField.set(null);
    this.imagePreviewUrl.set(null);
    this.pendingImageFile = null;
    this.imageUploadError.set(null);
  }

  catLabelFor(cat: PodcastCategory | string): string {
    return PODCAST_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
  }
}
