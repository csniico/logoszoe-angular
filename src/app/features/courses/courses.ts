import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CourseService } from '../../core/services/course.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Course, COURSE_LEVELS } from '../../core/models/course.model';

type SortKey = 'date' | 'az' | 'za';

@Component({
  selector: 'app-courses',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './courses.html',
  styleUrl: './courses.scss',
})
export class CoursesComponent implements OnInit {
  private readonly courseService = inject(CourseService);
  private readonly confirmModal  = inject(ConfirmModalService);
  private readonly router        = inject(Router);

  // ── Remote data ──────────────────────────────────────────────
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly searchQuery = signal('');
  readonly sortBy      = signal<SortKey>('date');

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<Course[]>(() => {
    const q    = this.searchQuery().toLowerCase().trim();
    const sort = this.sortBy();

    let list = this.courses();

    if (q) {
      list = list.filter((c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
      );
    }

    const sorted = [...list];
    if (sort === 'date') sorted.sort((a, b) => this.ts(b) - this.ts(a));
    if (sort === 'az')   sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'za')   sorted.sort((a, b) => b.title.localeCompare(a.title));

    return sorted;
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.courseService.getAll().subscribe({
      next:  (courses) => { this.courses.set(courses); this.loading.set(false); },
      error: ()        => { this.error.set('Failed to load courses.'); this.loading.set(false); },
    });
  }

  // ── Navigation ────────────────────────────────────────────────
  goTo(id: string): void {
    void this.router.navigate(['/courses', id]);
  }

  // ── Delete ────────────────────────────────────────────────────
  async delete(id: string, title: string, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirmModal.open({
      intent: `Delete "${title}"?`,
      description: 'All lessons will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.courseService.delete(id).subscribe({
      next: () => this.courses.update((list) => list.filter((c) => c._id !== id)),
    });
  }

  readonly levelOptions = COURSE_LEVELS;

  levelLabel(val: string): string {
    return this.levelOptions.find(m => m.value === val)?.label ?? val;
  }

  // ── Image error fallback ──────────────────────────────────────
  readonly failedImages = signal(new Set<string>());
  onCoverError(id: string): void {
    this.failedImages.update((s) => new Set([...s, id]));
  }

  // ── Helpers ───────────────────────────────────────────────────
  formatDuration(sec?: number): string {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
    return `${m}m`;
  }

  private ts(c: Course): number {
    return c.createdAt ? new Date(c.createdAt).getTime() : 0;
  }
}
