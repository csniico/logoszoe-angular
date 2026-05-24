import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { Product, PRODUCT_STATUSES, PRODUCT_CATEGORIES } from '../../../core/models/product.model';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetailComponent implements OnInit {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly storageService = inject(StorageService);
  private readonly confirmModal   = inject(ConfirmModalService);

  // ── Page state ────────────────────────────────────────────────
  readonly product   = signal<Product | null>(null);
  readonly loading   = signal(true);
  readonly error     = signal<string | null>(null);

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

  // ── Lookup data ───────────────────────────────────────────────
  readonly productStatuses   = PRODUCT_STATUSES;
  readonly productCategories = PRODUCT_CATEGORIES;

  // ── Typed draft accessors ──────────────────────────────────────
  get draftString(): string { return (this.draftValue() as string) ?? ''; }
  get draftNumber(): number { return (this.draftValue() as number) ?? 0; }

  setDraftString(v: string): void { this.draftValue.set(v); }
  setDraftNumber(v: number): void { this.draftValue.set(v); }

  // ── Computed helpers ──────────────────────────────────────────
  readonly statusLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    return PRODUCT_STATUSES.find((s) => s.value === p.status)?.label ?? p.status;
  });

  readonly categoryLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    return PRODUCT_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category;
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.productService.getById(id).subscribe({
      next:  (prod) => { this.product.set(prod); this.loading.set(false); },
      error: ()     => { this.error.set('Product not found.'); this.loading.set(false); },
    });
  }

  // ── Field editing ─────────────────────────────────────────────
  startEdit(field: string): void {
    const prod = this.product();
    if (!prod) return;
    this.draftValue.set((prod as any)[field] ?? '');
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEdit(): void {
    this.editingField.set(null);
    this.draftValue.set(null);
    this.saveError.set(null);
  }

  saveField(field: string): void {
    const prod = this.product();
    if (!prod) return;
    this.saving.set(true);
    this.saveError.set(null);

    this.productService.update(prod._id, { [field]: this.draftValue() }).subscribe({
      next: (updated) => {
        this.product.set(updated);
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
  async deleteProduct(): Promise<void> {
    const prod = this.product();
    if (!prod) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${prod.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    this.deleting.set(true);
    this.productService.delete(prod._id).subscribe({
      next:  () => void this.router.navigate(['/shop']),
      error: () => {
        this.saveError.set('Failed to delete product. Please try again.');
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
    const prod = this.product();
    const file = this.pendingImageFile;
    if (!prod || !file) return;

    this.uploadingImage.set(true);
    this.imageUploadError.set(null);

    this.storageService.uploadFile(file, 'shop/images').subscribe({
      next: (presigned) => {
        this.productService
          .update(prod._id, { imageUrl: presigned.fileUrl, imageKey: presigned.fileKey })
          .subscribe({
            next: (updated) => {
              this.product.set(updated);
              this.uploadingImage.set(false);
              this.editingField.set(null);
              this.imagePreviewUrl.set(null);
              this.pendingImageFile = null;
            },
            error: () => {
              this.imageUploadError.set('Failed to update product after upload.');
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
}
