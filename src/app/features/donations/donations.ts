import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DonationService } from '../../core/services/donation.service';
import { Donation, DonationCategory } from '../../core/models/donation.model';

@Component({
  selector: 'app-donations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './donations.html',
  styleUrl: './donations.scss',
})
export class DonationsComponent implements OnInit {
  private readonly donationService = inject(DonationService);

  readonly donations = signal<Donation[]>([]);
  readonly loading   = signal(true);
  readonly error     = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly categoryFilter = signal<'all' | DonationCategory>('all');

  // ── Filtered list ──────────────────────────────────────────────
  readonly displayed = computed<Donation[]>(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cat = this.categoryFilter();
    return this.donations().filter((d) => {
      if (cat !== 'all' && d.category !== cat) return false;
      if (!q) return true;
      return (
        d.donorName.toLowerCase().includes(q) ||
        d.donorEmail.toLowerCase().includes(q) ||
        d.productIdentifier.toLowerCase().includes(q)
      );
    });
  });

  // ── Summary stats (across the unfiltered set) ──────────────────
  readonly totalCount        = computed(() => this.donations().length);
  readonly partnershipCount  = computed(
    () => this.donations().filter((d) => d.category === 'partnership').length,
  );
  readonly oneTimeCount      = computed(
    () => this.donations().filter((d) => d.category === 'oneTime').length,
  );

  /** Totals by currency — donations can span currencies, so we don't sum across them. */
  readonly totalsByCurrency = computed<{ currency: string; amount: number }[]>(() => {
    const map = new Map<string, number>();
    for (const d of this.donations()) {
      if (d.amount == null) continue;
      const cur = (d.currency || 'USD').toUpperCase();
      map.set(cur, (map.get(cur) ?? 0) + d.amount);
    }
    return [...map.entries()].map(([currency, amount]) => ({ currency, amount }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.donationService.getAll().subscribe({
      next: (data) => {
        this.donations.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load donations.');
        this.loading.set(false);
      },
    });
  }

  // ── Display helpers ────────────────────────────────────────────
  categoryLabel(c: DonationCategory): string {
    return c === 'partnership' ? 'Partnership' : 'One-time';
  }

  /** Amount is stored in the smallest currency unit (cents). */
  formatAmount(d: Donation): string {
    if (d.amount == null) return '—';
    const cur = (d.currency || 'USD').toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: cur,
      }).format(d.amount / 100);
    } catch {
      return `${(d.amount / 100).toFixed(2)} ${cur}`;
    }
  }

  formatCurrencyTotal(t: { currency: string; amount: number }): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: t.currency,
      }).format(t.amount / 100);
    } catch {
      return `${(t.amount / 100).toFixed(2)} ${t.currency}`;
    }
  }
}
