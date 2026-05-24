import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CourseService } from '../../../core/services/course.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { CourseVideoService } from '../../../core/services/course-video.service';
import { StorageService } from '../../../core/services/storage.service';
import { Course, Lesson, LessonType, Question, QuestionType, QuestionOption } from '../../../core/models/course.model';
import { CourseVideo } from '../../../core/models/course-video.model';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetailComponent implements OnInit {
  private readonly route              = inject(ActivatedRoute);
  private readonly router             = inject(Router);
  private readonly courseService      = inject(CourseService);
  private readonly courseVideoService = inject(CourseVideoService);
  private readonly storageService     = inject(StorageService);
  private readonly confirmModal       = inject(ConfirmModalService);

  // ── Course ────────────────────────────────────────────────────
  readonly course         = signal<Course | null>(null);
  readonly loading        = signal(true);
  readonly error          = signal<string | null>(null);

  // ── Lessons ───────────────────────────────────────────────────
  readonly lessons        = signal<Lesson[]>([]);
  readonly loadingLessons = signal(false);

  // ── Editing course fields ─────────────────────────────────────
  readonly editingField   = signal<string | null>(null);
  readonly saving         = signal(false);
  readonly saveError      = signal<string | null>(null);

  // Edit buffers
  editTitle       = '';
  editDescription = '';

  // Cover image
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly coverImgError    = signal(false);
  pendingImageFile: File | null = null;

  // ── Add lesson form ───────────────────────────────────────────
  readonly showAddLesson   = signal(false);
  readonly newLessonType   = signal<LessonType>('text');
  readonly addingLesson    = signal(false);
  readonly addLessonError  = signal<string | null>(null);
  newLessonTitle   = '';
  newLessonContent = '';

  // Video picker for video lessons
  readonly videos          = signal<CourseVideo[]>([]);
  readonly selectedVideoId = signal<string | null>(null);

  // ── Lesson accordion ─────────────────────────────────────────
  readonly expandedLessonId  = signal<string | null>(null);

  // ── Editing a lesson inline ───────────────────────────────────
  readonly editingLessonId   = signal<string | null>(null);
  readonly savingLessonId    = signal<string | null>(null);
  readonly deletingLessonId  = signal<string | null>(null);

  // Inline lesson edit buffers
  editLessonTitle   = '';
  editLessonContent = '';

  // ── Questions (per lesson) ────────────────────────────────────
  /** Map of lessonId → Question[] */
  readonly questionMap = signal<Record<string, Question[]>>({});
  readonly loadingQuestionsFor = signal<string | null>(null);

  /** lessonId that has the "add question" panel open */
  readonly addingQuestionFor = signal<string | null>(null);

  /** lessonId + questionId being edited inline */
  readonly editingQuestionId = signal<string | null>(null);
  readonly savingQuestionId  = signal<string | null>(null);
  readonly deletingQuestionId = signal<string | null>(null);

  // New question form buffers
  newQuestionText    = '';
  newQuestionType: QuestionType = 'multiple_choice';
  newQuestionOptions: QuestionOption[] = [
    { label: 'A', value: '' },
    { label: 'B', value: '' },
    { label: 'C', value: '' },
    { label: 'D', value: '' },
  ];
  newQuestionCorrect = '';
  readonly addingQuestion = signal(false);
  readonly addQuestionError = signal<string | null>(null);

  // Edit question buffers
  editQuestionText    = '';
  editQuestionType: QuestionType = 'multiple_choice';
  editQuestionOptions: QuestionOption[] = [];
  editQuestionCorrect = '';

  // ── Computed ──────────────────────────────────────────────────
  readonly selectedVideo = computed<CourseVideo | null>(() => {
    const id = this.selectedVideoId();
    return id ? (this.videos().find((v) => v._id === id) ?? null) : null;
  });

  private get courseId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.courseId;
    this.courseService.getById(id).subscribe({
      next: (c) => { this.course.set(c); this.loading.set(false); },
      error: () => { this.error.set('Failed to load course.'); this.loading.set(false); },
    });

    this.loadingLessons.set(true);
    this.courseService.getLessons(id).subscribe({
      next: (ls) => { this.lessons.set(ls.sort((a, b) => a.order - b.order)); this.loadingLessons.set(false); },
      error: () => { this.loadingLessons.set(false); },
    });

    this.courseVideoService.getAll().subscribe({
      next: (vids) => this.videos.set(vids),
      error: () => { /* non-fatal */ },
    });
  }

  // ── Course field editing ──────────────────────────────────────
  startEditField(field: string): void {
    const c = this.course();
    if (!c) return;
    if (field === 'title')       this.editTitle = c.title;
    if (field === 'description') this.editDescription = c.description;
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEditField(): void {
    this.editingField.set(null);
  }

  saveField(field: string): void {
    const c = this.course();
    if (!c) return;
    this.saving.set(true);
    this.saveError.set(null);

    const patch: Partial<Course> = field === 'title'
      ? { title: this.editTitle.trim() }
      : { description: this.editDescription.trim() };

    this.courseService.update(c._id, patch).subscribe({
      next: (updated) => { this.course.set(updated); this.editingField.set(null); this.saving.set(false); },
      error: () => { this.saveError.set('Failed to save. Please try again.'); this.saving.set(false); },
    });
  }

  // ── Cover image ───────────────────────────────────────────────
  onImageFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingImageFile = file;
    this.imageUploadError.set(null);
    this.uploadImage();
  }

  uploadImage(): void {
    const file = this.pendingImageFile;
    const c    = this.course();
    if (!file || !c) return;
    this.uploadingImage.set(true);
    this.imageUploadError.set(null);
    this.storageService.uploadFile(file, 'courses/images').subscribe({
      next: (r) => {
        this.courseService.update(c._id, { imageUrl: r.fileUrl, imageKey: r.fileKey }).subscribe({
          next: (updated) => {
            this.course.set(updated);
            this.coverImgError.set(false);
            this.uploadingImage.set(false);
          },
          error: () => { this.imageUploadError.set('Failed to save image.'); this.uploadingImage.set(false); },
        });
      },
      error: () => {
        this.imageUploadError.set('Upload failed. Please try again.');
        this.uploadingImage.set(false);
      },
    });
  }

  // ── Delete course ─────────────────────────────────────────────
  async deleteCourse(): Promise<void> {
    const c = this.course();
    if (!c) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${c.title}"?`,
      description: 'All lessons will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.courseService.delete(c._id).subscribe({
      next: () => void this.router.navigate(['/courses']),
      error: () => alert('Failed to delete course.'),
    });
  }

  // ── Lesson management ─────────────────────────────────────────
  addLesson(): void {
    if (!this.newLessonTitle.trim()) return;
    const c = this.course();
    if (!c) return;

    this.addingLesson.set(true);
    this.addLessonError.set(null);

    let content    = this.newLessonContent;
    let contentKey: string | undefined;
    if (this.newLessonType() === 'video' && this.selectedVideo()) {
      const cv   = this.selectedVideo()!;
      content    = cv._id;
      contentKey = cv.videoKey;
    }

    const order = this.lessons().length + 1;
    this.courseService.createLesson(c._id, {
      title:   this.newLessonTitle.trim(),
      type:    this.newLessonType(),
      content,
      contentKey,
      order,
    }).subscribe({
      next: (lesson) => {
        this.lessons.update((ls) => [...ls, lesson]);
        this.newLessonTitle   = '';
        this.newLessonContent = '';
        this.selectedVideoId.set(null);
        this.showAddLesson.set(false);
        this.addingLesson.set(false);
      },
      error: () => {
        this.addLessonError.set('Failed to add lesson.');
        this.addingLesson.set(false);
      },
    });
  }

  async deleteLesson(lessonId: string): Promise<void> {
    const c = this.course();
    if (!c) return;
    const ok = await this.confirmModal.open({
      intent: 'Delete lesson?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deletingLessonId.set(lessonId);
    this.courseService.deleteLesson(c._id, lessonId).subscribe({
      next: () => {
        this.lessons.update((ls) => ls.filter((l) => l._id !== lessonId));
        this.deletingLessonId.set(null);
      },
      error: () => {
        alert('Failed to delete lesson.');
        this.deletingLessonId.set(null);
      },
    });
  }

  // ── Accordion ─────────────────────────────────────────────────
  toggleLesson(id: string): void {
    const wasOpen = this.expandedLessonId() === id;
    this.expandedLessonId.set(wasOpen ? null : id);
    if (wasOpen) {
      this.editingLessonId.set(null);
      this.addingQuestionFor.set(null);
      this.editingQuestionId.set(null);
    } else {
      // Lazy-load questions when opening a lesson
      this.loadQuestionsForLesson(id);
    }
  }

  startEditLesson(lesson: Lesson): void {
    this.editLessonTitle   = lesson.title;
    this.editLessonContent = lesson.content;
    this.editingLessonId.set(lesson._id);
    this.expandedLessonId.set(lesson._id);
  }

  cancelEditLesson(): void {
    this.editingLessonId.set(null);
  }

  saveLessonEdit(lesson: Lesson): void {
    const c = this.course();
    if (!c) return;
    this.savingLessonId.set(lesson._id);
    this.courseService.updateLesson(c._id, lesson._id, {
      title:   this.editLessonTitle.trim(),
      content: this.editLessonContent,
    }).subscribe({
      next: (updated) => {
        this.lessons.update((ls) => ls.map((l) => (l._id === updated._id ? updated : l)));
        this.editingLessonId.set(null);
        this.savingLessonId.set(null);
      },
      error: () => {
        alert('Failed to save lesson.');
        this.savingLessonId.set(null);
      },
    });
  }

  // ── Move lesson up / down ─────────────────────────────────────
  moveLesson(lessonId: string, direction: -1 | 1): void {
    const c = this.course();
    if (!c) return;

    const ls  = [...this.lessons()];
    const idx = ls.findIndex((l) => l._id === lessonId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ls.length) return;

    // Swap
    [ls[idx], ls[newIdx]] = [ls[newIdx], ls[idx]];
    // Fix order values
    ls.forEach((l, i) => { l = { ...l, order: i + 1 }; ls[i] = l; });
    this.lessons.set(ls);

    const ids = ls.map((l) => l._id);
    this.courseService.reorderLessons(c._id, ids).subscribe({
      error: () => {
        // Revert on error by reloading
        this.courseService.getLessons(c._id).subscribe({
          next: (fresh) => this.lessons.set(fresh.sort((a, b) => a.order - b.order)),
        });
      },
    });
  }

  // ── Questions ─────────────────────────────────────────────────
  questionsFor(lessonId: string): Question[] {
    return this.questionMap()[lessonId] ?? [];
  }

  private loadQuestionsForLesson(lessonId: string): void {
    const c = this.course();
    if (!c) return;
    // Already loaded
    if (this.questionMap()[lessonId] !== undefined) return;

    this.loadingQuestionsFor.set(lessonId);
    this.courseService.getQuestions(c._id, lessonId).subscribe({
      next: (qs) => {
        this.questionMap.update((m) => ({ ...m, [lessonId]: qs }));
        this.loadingQuestionsFor.set(null);
      },
      error: () => {
        this.questionMap.update((m) => ({ ...m, [lessonId]: [] }));
        this.loadingQuestionsFor.set(null);
      },
    });
  }

  openAddQuestion(lessonId: string): void {
    this.addingQuestionFor.set(lessonId);
    this.resetNewQuestionForm();
    this.addQuestionError.set(null);
  }

  cancelAddQuestion(): void {
    this.addingQuestionFor.set(null);
    this.resetNewQuestionForm();
  }

  private resetNewQuestionForm(): void {
    this.newQuestionText    = '';
    this.newQuestionType    = 'multiple_choice';
    this.newQuestionOptions = [
      { label: 'A', value: '' },
      { label: 'B', value: '' },
      { label: 'C', value: '' },
      { label: 'D', value: '' },
    ];
    this.newQuestionCorrect = '';
  }

  submitNewQuestion(lessonId: string): void {
    if (!this.newQuestionText.trim()) return;
    const c = this.course();
    if (!c) return;

    this.addingQuestion.set(true);
    this.addQuestionError.set(null);

    const payload: Partial<Question> = {
      text: this.newQuestionText.trim(),
      type: this.newQuestionType,
    };
    if (this.newQuestionType === 'multiple_choice') {
      payload.options       = this.newQuestionOptions.filter((o) => o.value.trim());
      payload.correctOption = this.newQuestionCorrect;
    }

    this.courseService.createQuestion(c._id, lessonId, payload).subscribe({
      next: (q) => {
        this.questionMap.update((m) => ({
          ...m,
          [lessonId]: [...(m[lessonId] ?? []), q],
        }));
        this.addingQuestionFor.set(null);
        this.addingQuestion.set(false);
        this.resetNewQuestionForm();
      },
      error: () => {
        this.addQuestionError.set('Failed to add question.');
        this.addingQuestion.set(false);
      },
    });
  }

  startEditQuestion(question: Question): void {
    this.editQuestionText    = question.text;
    this.editQuestionType    = question.type;
    this.editQuestionOptions = question.options?.length
      ? question.options.map((o) => ({ ...o }))
      : [{ label: 'A', value: '' }, { label: 'B', value: '' }, { label: 'C', value: '' }, { label: 'D', value: '' }];
    this.editQuestionCorrect = question.correctOption ?? '';
    this.editingQuestionId.set(question._id);
  }

  cancelEditQuestion(): void {
    this.editingQuestionId.set(null);
  }

  saveQuestionEdit(lessonId: string, question: Question): void {
    const c = this.course();
    if (!c) return;
    this.savingQuestionId.set(question._id);

    const patch: Partial<Question> = {
      text: this.editQuestionText.trim(),
      type: this.editQuestionType,
    };
    if (this.editQuestionType === 'multiple_choice') {
      patch.options       = this.editQuestionOptions.filter((o) => o.value.trim());
      patch.correctOption = this.editQuestionCorrect;
    } else {
      patch.options       = [];
      patch.correctOption = undefined;
    }

    this.courseService.updateQuestion(c._id, lessonId, question._id, patch).subscribe({
      next: (updated) => {
        this.questionMap.update((m) => ({
          ...m,
          [lessonId]: (m[lessonId] ?? []).map((q) => (q._id === updated._id ? updated : q)),
        }));
        this.editingQuestionId.set(null);
        this.savingQuestionId.set(null);
      },
      error: () => {
        alert('Failed to save question.');
        this.savingQuestionId.set(null);
      },
    });
  }

  async deleteQuestion(lessonId: string, question: Question): Promise<void> {
    const c = this.course();
    if (!c) return;
    const ok = await this.confirmModal.open({
      intent: 'Delete question?',
      description: `"${question.text}" will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deletingQuestionId.set(question._id);
    this.courseService.deleteQuestion(c._id, lessonId, question._id).subscribe({
      next: () => {
        this.questionMap.update((m) => ({
          ...m,
          [lessonId]: (m[lessonId] ?? []).filter((q) => q._id !== question._id),
        }));
        this.deletingQuestionId.set(null);
      },
      error: () => {
        alert('Failed to delete question.');
        this.deletingQuestionId.set(null);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  videoForLesson(lesson: Lesson): CourseVideo | undefined {
    return this.videos().find((v) => v._id === lesson.content);
  }

  formatLessonDuration(sec?: number): string {
    if (!sec || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
    if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
    return `${s}s`;
  }

  optionLabels = ['A', 'B', 'C', 'D'];
}
