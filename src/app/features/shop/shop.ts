import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ProductService } from '../../core/services/product.service';
import { SearchService } from '../../core/services/search.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Product, PRODUCT_STATUSES, PRODUCT_CATEGORIES } from '../../core/models/product.model';

type SortKey = 'date' | 'price-asc' | 'price-desc' | 'az' | 'za';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class ShopComponent implements OnInit, OnDestroy {
  private readonly productService = inject(ProductService);
  private readonly searchService  = inject(SearchService);
  private readonly confirmModal   = inject(ConfirmModalService);
  private readonly router         = inject(Router);
  private readonly destroy$       = new Subject<void>();

  // ── Remote data ──────────────────────────────────────────────
  readonly products = signal<Product[]>([]);
  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly viewMode       = signal<'grid' | 'table'>('grid');
  readonly searchQuery    = signal('');
  readonly filterCategory = signal('');
  readonly filterStatus   = signal('');
  readonly sortBy         = signal<SortKey>('date');

  // ── Lookups ───────────────────────────────────────────────────
  readonly productStatuses   = PRODUCT_STATUSES;
  readonly productCategories = PRODUCT_CATEGORIES;

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Product[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const cat    = this.filterCategory();
    const status = this.filterStatus();
    const sort   = this.sortBy();

    let list = this.products();

    if (q) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
      );
    }

    if (cat) {
      list = list.filter((p) => p.category === cat);
    }

    if (status) {
      list = list.filter((p) => p.status === status);
    }

    const sorted = [...list];
    if (sort === 'az')         sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')         sorted.sort((a, b) => b.title.localeCompare(a.title));
    if (sort === 'date')       sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'price-asc')  sorted.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);

    return sorted;
  });

  readonly hasActiveFilters = computed(() =>
    this.searchQuery().trim() !== '' ||
    this.filterCategory() !== '' ||
    this.filterStatus() !== '',
  );

  // ── Backend search state ─────────────────────────────────────
  readonly backendResults   = signal<Product[]>([]);
  readonly searchingBackend = signal(false);
  readonly backendSearched  = signal(false);
  readonly backendTotal     = signal(0);

  private readonly searchQuery$ = new Subject<string>();

  readonly showBackendResults = computed(() =>
    this.searchQuery().trim() !== '' && this.displayed().length === 0,
  );

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.productService.getAll().subscribe({
      next:  (prods) => { this.products.set(prods); this.loading.set(false); },
      error: ()      => { this.error.set('Failed to load products.'); this.loading.set(false); },
    });

    this.searchQuery$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((q) => {
      if (q.trim() && this.displayed().length === 0) {
        this.runBackendSearch(q.trim());
      } else {
        this.backendResults.set([]);
        this.backendSearched.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Backend search ────────────────────────────────────────────
  onSearchInput(q: string): void {
    this.searchQuery.set(q);
    this.backendResults.set([]);
    this.backendSearched.set(false);
    this.searchQuery$.next(q);
  }

  private runBackendSearch(q: string): void {
    this.searchingBackend.set(true);
    this.searchService.search<Product>(q, 'products').subscribe({
      next: (res) => {
        this.backendResults.set(res.data);
        this.backendTotal.set(res.total);
        this.backendSearched.set(true);
        this.searchingBackend.set(false);
      },
      error: () => {
        this.searchingBackend.set(false);
        this.backendSearched.set(true);
      },
    });
  }

  // ── Navigation ────────────────────────────────────────────────
  goToProduct(id: string): void {
    void this.router.navigate(['/shop', id]);
  }

  // ── Delete ────────────────────────────────────────────────────
  async deleteProduct(event: Event, id: string): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirmModal.open({
      intent: 'Delete product?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.productService.delete(id).subscribe({
      next: () => this.products.update((list) => list.filter((p) => p._id !== id)),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  statusLabel(status: string): string {
    return PRODUCT_STATUSES.find((s) => s.value === status)?.label ?? status;
  }

  categoryLabel(category: string): string {
    return PRODUCT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
  }

  formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.filterCategory.set('');
    this.filterStatus.set('');
    this.sortBy.set('date');
    this.backendResults.set([]);
    this.backendSearched.set(false);
  }

  private ts(p: Product): number {
    return p.createdAt ? new Date(p.createdAt).getTime() : 0;
  }
}
