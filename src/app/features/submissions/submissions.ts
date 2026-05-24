import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../core/services/course.service';
import { Course, Lesson, EnrichedSubmission, EnrichedResponse } from '../../core/models/course.model';

@Component({
  selector: 'app-submissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './submissions.html',
  styleUrl: './submissions.scss',
})
export class SubmissionsComponent implements OnInit {
  private readonly courseService = inject(CourseService);

  // ── Data ─────────────────────────────────────────────────────
  readonly courses     = signal<Course[]>([]);
  readonly lessons     = signal<Lesson[]>([]);
  readonly submissions = signal<EnrichedSubmission[]>([]);

  // ── Loading states ────────────────────────────────────────────
  readonly loadingCourses     = signal(true);
  readonly loadingLessons     = signal(false);
  readonly loadingSubmissions = signal(true);

  // ── Filters ───────────────────────────────────────────────────
  readonly selectedCourseId  = signal('');
  readonly selectedLessonId  = signal('');

  // ── Expanded row ──────────────────────────────────────────────
  readonly expandedId = signal<string | null>(null);

  // ── Computed helpers ──────────────────────────────────────────
  readonly courseMap = computed<Record<string, Course>>(() =>
    Object.fromEntries(this.courses().map((c) => [c._id, c]))
  );

  readonly lessonMap = computed<Record<string, Lesson>>(() =>
    Object.fromEntries(this.lessons().map((l) => [l._id, l]))
  );

  courseNameFor(courseId: string): string {
    return this.courseMap()[courseId]?.title ?? courseId;
  }

  lessonNameFor(lessonId: string): string {
    return this.lessonMap()[lessonId]?.title ?? lessonId;
  }

  /** MC responses with a definitive correct/wrong answer */
  mcResponses(sub: EnrichedSubmission): EnrichedResponse[] {
    return sub.responses.filter((r) => r.questionType === 'multiple_choice');
  }

  score(sub: EnrichedSubmission): { correct: number; total: number } | null {
    const mc = this.mcResponses(sub);
    if (!mc.length) return null;
    return { correct: mc.filter((r) => r.isCorrect).length, total: mc.length };
  }

  toggleRow(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.courseService.getAll().subscribe({
      next: (cs) => { this.courses.set(cs); this.loadingCourses.set(false); },
      error: ()  => { this.loadingCourses.set(false); },
    });

    this.loadSubmissions();
  }

  // ── Filter handlers ───────────────────────────────────────────
  onCourseChange(courseId: string): void {
    this.selectedCourseId.set(courseId);
    this.selectedLessonId.set('');
    this.lessons.set([]);

    if (courseId) {
      this.loadingLessons.set(true);
      this.courseService.getLessons(courseId).subscribe({
        next: (ls) => {
          this.lessons.set(ls.sort((a, b) => a.order - b.order));
          this.loadingLessons.set(false);
        },
        error: () => { this.loadingLessons.set(false); },
      });
    }

    this.loadSubmissions();
  }

  onLessonChange(lessonId: string): void {
    this.selectedLessonId.set(lessonId);
    this.loadSubmissions();
  }

  private loadSubmissions(): void {
    this.loadingSubmissions.set(true);
    this.expandedId.set(null);

    const filters: { courseId?: string; lessonId?: string } = {};
    if (this.selectedCourseId()) filters.courseId = this.selectedCourseId();
    if (this.selectedLessonId()) filters.lessonId = this.selectedLessonId();

    this.courseService.getAllSubmissions(filters).subscribe({
      next: (subs) => { this.submissions.set(subs); this.loadingSubmissions.set(false); },
      error: ()    => { this.loadingSubmissions.set(false); },
    });
  }
}
