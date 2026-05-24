import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/services/product.service';
import { StorageService } from '../../../core/services/storage.service';
import {
  PRODUCT_STATUSES,
  PRODUCT_CATEGORIES,
  ProductStatus,
  ProductCategory,
} from '../../../core/models/product.model';

export type ProductWizardStep = 1 | 2 | 3;

@Component({
  selector: 'app-product-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-create.html',
  styleUrl: './product-create.scss',
})
export class ProductCreateComponent {
  private readonly productService = inject(ProductService);
  private readonly storageService = inject(StorageService);
  private readonly router         = inject(Router);

  // ── Wizard step ────────────────────────────────────────────────
  readonly currentStep = signal<ProductWizardStep>(1);

  readonly steps = [
    { id: 1 as ProductWizardStep, label: 'Details'  },
    { id: 2 as ProductWizardStep, label: 'Image'    },
    { id: 3 as ProductWizardStep, label: 'Review'   },
  ];

  // ── Lookups ───────────────────────────────────────────────────
  readonly productStatuses   = PRODUCT_STATUSES;
  readonly productCategories = PRODUCT_CATEGORIES;

  // ── Step 1 ─────────────────────────────────────────────────────
  title       = '';
  description = '';
  category    = '' as ProductCategory | '';
  price       = 0;
  quantity    = 0;
  status: ProductStatus = 'coming_soon';

  // ── Step 2 ─────────────────────────────────────────────────────
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly imagePreviewUrl  = signal<string | null>(null);
  imageUrl = '';
  imageKey = '';
  pendingImageFile: File | null = null;

  // ── Save state ─────────────────────────────────────────────────
  readonly saving    = signal(false);
  readonly saveError = signal<string | null>(null);

  // ── Computed validation ────────────────────────────────────────
  readonly step1Valid = computed(() =>
    this.title.trim().length > 0 &&
    this.description.trim().length > 0 &&
    this.category !== '' &&
    this.price > 0,
  );

  readonly step2Valid = computed(() => this.imageUrl !== '');

  // ── Computed summary labels ────────────────────────────────────
  readonly selectedStatusLabel = computed(() =>
    PRODUCT_STATUSES.find((s) => s.value === this.status)?.label ?? this.status,
  );

  readonly selectedCategoryLabel = computed(() =>
    (PRODUCT_CATEGORIES.find((c) => c.value === this.category)?.label ?? this.category) || 'None',
  );

  // ── Navigation ─────────────────────────────────────────────────
  canGoNext(): boolean {
    const s = this.currentStep();
    if (s === 1) return this.step1Valid();
    if (s === 2) return this.step2Valid();
    return true;
  }

  next(): void {
    if (!this.canGoNext()) return;
    const s = this.currentStep();
    if (s < 3) this.currentStep.set((s + 1) as ProductWizardStep);
    else this.save();
  }

  back(): void {
    const s = this.currentStep();
    if (s > 1) this.currentStep.set((s - 1) as ProductWizardStep);
  }

  goToStep(step: ProductWizardStep): void {
    if (step < this.currentStep()) this.currentStep.set(step);
  }

  // ── Step 2: image upload ────────────────────────────────────────
  onImageChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadImage(): void {
    const file = this.pendingImageFile;
    if (!file) return;
    this.uploadingImage.set(true);
    this.imageUploadError.set(null);

    this.storageService.uploadFile(file, 'shop/images').subscribe({
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

  // ── Final save ──────────────────────────────────────────────────
  save(): void {
    if (!this.step1Valid()) { this.currentStep.set(1); return; }
    if (!this.step2Valid()) { this.currentStep.set(2); return; }

    this.saving.set(true);
    this.saveError.set(null);

    this.productService.create({
      title:       this.title.trim(),
      description: this.description.trim(),
      category:    this.category as ProductCategory,
      price:       this.price,
      quantity:    this.quantity,
      status:      this.status,
      imageUrl:    this.imageUrl,
      imageKey:    this.imageKey,
    }).subscribe({
      next: (product) => {
        this.saving.set(false);
        void this.router.navigate(['/shop', product._id]);
      },
      error: () => {
        this.saveError.set('Failed to create product. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
