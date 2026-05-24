import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrayerService } from '../../core/services/prayer.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Prayer } from '../../core/models/prayer.model';

type AnonFilter = 'all' | 'anonymous' | 'named';

@Component({
  selector: 'app-prayer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prayer.html',
  styleUrl: './prayer.scss',
})
export class PrayerComponent implements OnInit {
  private readonly prayerService = inject(PrayerService);
  private readonly confirmModal  = inject(ConfirmModalService);

  readonly prayers         = signal<Prayer[]>([]);
  readonly loading         = signal(true);
  readonly error           = signal<string | null>(null);
  readonly searchQuery     = signal('');
  readonly filterAnonymous = signal<AnonFilter>('all');
  readonly selectedPrayer  = signal<Prayer | null>(null);
  readonly deleting        = signal<string | null>(null);

  readonly displayed = computed<Prayer[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const filter = this.filterAnonymous();

    let list = this.prayers();

    if (q) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.topic.toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q),
      );
    }

    if (filter === 'anonymous') list = list.filter((p) => p.anonymous);
    if (filter === 'named')     list = list.filter((p) => !p.anonymous);

    return list;
  });

  ngOnInit(): void {
    this.prayerService.getAll().subscribe({
      next:  (data) => { this.prayers.set(data); this.loading.set(false); },
      error: ()     => { this.error.set('Failed to load prayer requests.'); this.loading.set(false); },
    });
  }

  viewPrayer(p: Prayer): void {
    this.selectedPrayer.set(p);
  }

  closePrayer(): void {
    this.selectedPrayer.set(null);
  }

  async delete(id: string): Promise<void> {
    const ok = await this.confirmModal.open({
      intent: 'Delete prayer request?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    this.deleting.set(id);
    this.prayerService.delete(id).subscribe({
      next: () => {
        this.prayers.update((list) => list.filter((p) => p._id !== id));
        if (this.selectedPrayer()?._id === id) this.selectedPrayer.set(null);
        this.deleting.set(null);
      },
      error: () => {
        alert('Failed to delete prayer request. Please try again.');
        this.deleting.set(null);
      },
    });
  }

  submitterLabel(p: Prayer): string {
    return p.anonymous ? 'Anonymous' : (p.name ?? 'Unknown');
  }

  topicColors: Record<string, string> = {};

  topicColor(topic: string): string {
    if (!this.topicColors[topic]) {
      const palette = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#65a30d'];
      const idx = [...topic].reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
      this.topicColors[topic] = palette[idx];
    }
    return this.topicColors[topic];
  }
}
