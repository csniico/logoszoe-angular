import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CourseService } from '../../../core/services/course.service';
import { ConfirmModalService } from '../../../shared/confirm-modal/confirm-modal.service';
import { CourseVideoService } from '../../../core/services/course-video.service';
import { StorageService } from '../../../core/services/storage.service';
import { DocumentPipelineService } from '../../../core/services/document-pipeline.service';
import { PipelineProgress } from '../../../core/models/pipeline.model';
import { Course, CourseModule, CourseLevel, Lesson, LessonType, EmbeddedQuestion, COURSE_LEVELS, LESSON_CONTENT_TYPES } from '../../../core/models/course.model';
import { CourseVideo } from '../../../core/models/course-video.model';
import { CourseVideoPlayerComponent } from '../../../shared/course-video-player/course-video-player';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CourseVideoPlayerComponent],
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
  private readonly pipeline           = inject(DocumentPipelineService);

  // ── Course ────────────────────────────────────────────────────
  readonly course         = signal<Course | null>(null);
  readonly loading        = signal(true);
  readonly error          = signal<string | null>(null);

  // ── Modules ───────────────────────────────────────────────────
  readonly modules        = signal<CourseModule[]>([]);
  readonly loadingModules = signal(false);

  // ── Lessons ───────────────────────────────────────────────────
  readonly lessons        = signal<Lesson[]>([]);
  readonly loadingLessons = signal(false);

  /** Lessons belonging to a module, ordered. */
  lessonsForModule(moduleId: string): Lesson[] {
    return this.lessons()
      .filter((l) => l.moduleId === moduleId)
      .sort((a, b) => a.order - b.order);
  }

  // ── Editing course fields ─────────────────────────────────────
  readonly editingField   = signal<string | null>(null);
  readonly saving         = signal(false);
  readonly saveError      = signal<string | null>(null);

  // ── Meta helpers ──────────────────────────────────────────────────────────
  readonly levelOptions        = COURSE_LEVELS;
  readonly lessonTypeOptions   = LESSON_CONTENT_TYPES;

  levelLabel(val: string): string {
    return this.levelOptions.find(m => m.value === val)?.label ?? val;
  }

  // ── Module add / edit state ─────────────────────────────────────────────────
  readonly showAddModule   = signal(false);
  readonly addingModule    = signal(false);
  readonly addModuleError  = signal<string | null>(null);
  newModuleTitle           = '';
  newModuleDescription     = '';

  readonly editingModuleId = signal<string | null>(null);
  readonly savingModuleId  = signal<string | null>(null);
  readonly deletingModuleId = signal<string | null>(null);
  editModuleTitle          = '';
  editModuleDescription    = '';

  /** When adding a lesson, the module it will be added to. */
  readonly addLessonModuleId = signal<string | null>(null);

  /**
   * Add-lesson flow driven from the header button:
   * 'closed' → 'module' (pick which module) → 'type' (pick text/video/audio)
   * → opens the add-lesson form.
   */
  readonly addLessonStage = signal<'closed' | 'module' | 'type'>('closed');

  startAddLessonFlow(): void {
    this.addLessonModuleId.set(null);
    this.addLessonStage.set('module');
  }

  pickAddLessonModule(moduleId: string): void {
    this.addLessonModuleId.set(moduleId);
    this.expandedModuleIds.update((s) => new Set(s).add(moduleId));
    this.addLessonStage.set('type');
  }

  cancelAddLessonFlow(): void {
    this.addLessonStage.set('closed');
  }

  /** Which module accordions are expanded (collapsed by default, like the app). */
  readonly expandedModuleIds = signal<Set<string>>(new Set<string>());

  toggleModule(id: string): void {
    this.expandedModuleIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Edit buffers
  editTitle       = '';
  editDescription = '';

  // Cover image
  readonly uploadingImage   = signal(false);
  readonly imageUploadError = signal<string | null>(null);
  readonly coverImgError    = signal(false);
  pendingImageFile: File | null = null;

  // ── User preview ──────────────────────────────────────────────
  readonly viewMode             = signal<'admin' | 'user'>('admin');
  readonly userExpandedLessonId = signal<string | null>(null);
  readonly openLesson           = signal<Lesson | null>(null);
  readonly completedLessonIds   = signal<Set<string>>(new Set());

  // ── Add lesson form ───────────────────────────────────────────
  readonly showAddLesson    = signal(false);
  readonly addLessonMenuOpen = signal(false);
  /** Which module's "Add lesson" dropdown menu is currently open (null = none). */
  readonly addLessonMenuModuleId = signal<string | null>(null);
  readonly newLessonType    = signal<LessonType>('text');
  readonly addingLesson     = signal(false);
  readonly addLessonError   = signal<string | null>(null);
  newLessonTitle = '';

  // text content (for text-type lessons; becomes lesson.content on save)
  newLessonTextContent = '';

  // audio upload
  readonly uploadingAudio = signal(false);
  readonly newAudioUrl    = signal('');
  readonly newAudioKey    = signal('');
  newAudioDuration        = 0;

  // study sections
  newLessonStudyQuestions:      EmbeddedQuestion[] = [{ text: '' }];
  newLessonReflectionQuestions: EmbeddedQuestion[] = [{ text: '' }];
  newLessonPrayer       = '';
  newLessonFurtherStudy = '';

  // DOCX extraction for lesson
  readonly extractingLesson  = signal(false);
  readonly extractLessonError = signal<string | null>(null);
  readonly extractLessonSuccess = signal(false);

  // document parsing (for backwards compat with pipeline - kept for document type if needed)
  readonly newLessonDocFile  = signal<File | null>(null);
  readonly parsingDoc        = signal(false);
  readonly parsedDocHtml     = signal('');
  readonly docParseError     = signal<string | null>(null);
  readonly newDocContentKey  = signal('');
  readonly pipelineState     = signal<PipelineProgress | null>(null);

  // Video picker for video lessons
  readonly videos          = signal<CourseVideo[]>([]);
  readonly selectedVideoId = signal<string | null>(null);

  // ── Lesson accordion ─────────────────────────────────────────
  readonly expandedLessonId  = signal<string | null>(null);

  // ── Editing a lesson inline ───────────────────────────────────
  readonly editingLessonId   = signal<string | null>(null);
  readonly savingLessonId    = signal<string | null>(null);
  readonly deletingLessonId  = signal<string | null>(null);

  // Inline lesson edit buffers - basic
  editLessonTitle       = '';
  editLessonContent     = '';   // used for text type only
  editLessonDescription = '';

  // Edit buffers for video / audio content replacement
  readonly editSelectedVideoId  = signal<string | null>(null);
  readonly uploadingEditAudio   = signal(false);
  readonly editAudioUploadError = signal<string | null>(null);
  editNewAudioUrl = '';   // populated only when user replaces audio
  editNewAudioKey = '';
  editNewAudioDuration = 0;

  // Inline lesson edit buffers - study guide
  editLessonStudyQuestions:      EmbeddedQuestion[] = [{ text: '' }];
  editLessonReflectionQuestions: EmbeddedQuestion[] = [{ text: '' }];
  editLessonPrayer       = '';
  editLessonFurtherStudy = '';

  // DOCX re-extraction for edit form
  readonly extractingEditLesson   = signal(false);
  readonly extractEditLessonError = signal<string | null>(null);
  readonly extractEditLessonSuccess = signal(false);

  // ── Computed ──────────────────────────────────────────────────
  readonly selectedVideo = computed<CourseVideo | null>(() => {
    const id = this.selectedVideoId();
    return id ? (this.videos().find((v) => v._id === id) ?? null) : null;
  });

  readonly editSelectedVideo = computed<CourseVideo | null>(() => {
    const id = this.editSelectedVideoId();
    return id ? (this.videos().find((v) => v._id === id) ?? null) : null;
  });

  private get courseId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  get viewAsUserUrl(): string {
    return `${environment.userAppUrl}/courses/${this.courseId}`;
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.courseId;
    this.courseService.getById(id).subscribe({
      next: (c) => { this.course.set(c); this.loading.set(false); },
      error: () => { this.error.set('Failed to load course.'); this.loading.set(false); },
    });

    this.loadingModules.set(true);
    this.courseService.getModules(id).subscribe({
      next: (ms) => { this.modules.set(ms.sort((a, b) => a.order - b.order)); this.loadingModules.set(false); },
      error: () => { this.loadingModules.set(false); },
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

  // ── User preview ─────────────────────────────────────────────
  toggleViewMode(): void {
    this.viewMode.update(m => m === 'admin' ? 'user' : 'admin');
    this.openLesson.set(null);
    this.userExpandedLessonId.set(null);
  }

  toggleUserLesson(id: string): void {
    this.userExpandedLessonId.update(cur => cur === id ? null : id);
  }

  openLessonDetail(lesson: Lesson): void {
    this.openLesson.set(lesson);
  }

  closeLessonDetail(): void {
    this.openLesson.set(null);
  }

  markComplete(lessonId: string): void {
    this.completedLessonIds.update(set => {
      const next = new Set(set);
      next.add(lessonId);
      return next;
    });
  }

  // ── Course field editing ──────────────────────────────────────
  startEditField(field: string): void {
    const c = this.course();
    if (!c) return;
    if (field === 'title')       this.editTitle       = c.title;
    if (field === 'description') this.editDescription = c.description ?? '';
    this.editingField.set(field);
    this.saveError.set(null);
  }

  cancelEditField(): void {
    this.editingField.set(null);
  }

  /** Update the course level inline (pills save immediately). */
  setLevel(level: CourseLevel): void {
    const c = this.course();
    if (!c || c.level === level) return;
    this.saveError.set(null);
    this.courseService.update(c._id, { level }).subscribe({
      next: (updated) => this.course.set(updated),
      error: () => this.saveError.set('Failed to update level.'),
    });
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

  // ── Module management ─────────────────────────────────────────

  openAddModule(): void {
    this.newModuleTitle = `Module ${this.modules().length + 1}`;
    this.newModuleDescription = '';
    this.addModuleError.set(null);
    this.showAddModule.set(true);
  }

  cancelAddModule(): void {
    this.showAddModule.set(false);
  }

  addModule(): void {
    const c = this.course();
    if (!c || !this.newModuleTitle.trim()) return;
    this.addingModule.set(true);
    this.addModuleError.set(null);
    this.courseService.createModule(c._id, {
      title: this.newModuleTitle.trim(),
      description: this.newModuleDescription.trim() || undefined,
    }).subscribe({
      next: (mod) => {
        this.modules.update((ms) => [...ms, { ...mod, lessonCount: 0 }]);
        // Expand the freshly created module so lessons can be added right away.
        this.expandedModuleIds.update((s) => new Set(s).add(mod._id));
        this.showAddModule.set(false);
        this.addingModule.set(false);
      },
      error: () => { this.addModuleError.set('Failed to add module.'); this.addingModule.set(false); },
    });
  }

  startEditModule(mod: CourseModule): void {
    this.editModuleTitle = mod.title;
    this.editModuleDescription = mod.description ?? '';
    this.editingModuleId.set(mod._id);
  }

  cancelEditModule(): void {
    this.editingModuleId.set(null);
  }

  saveModuleEdit(mod: CourseModule): void {
    const c = this.course();
    if (!c || !this.editModuleTitle.trim()) return;
    this.savingModuleId.set(mod._id);
    this.courseService.updateModule(c._id, mod._id, {
      title: this.editModuleTitle.trim(),
      description: this.editModuleDescription.trim() || undefined,
    }).subscribe({
      next: (updated) => {
        this.modules.update((ms) => ms.map((m) => (m._id === updated._id ? { ...updated, lessonCount: m.lessonCount } : m)));
        this.editingModuleId.set(null);
        this.savingModuleId.set(null);
      },
      error: () => { alert('Failed to save module.'); this.savingModuleId.set(null); },
    });
  }

  async deleteModule(mod: CourseModule): Promise<void> {
    const c = this.course();
    if (!c) return;
    const ok = await this.confirmModal.open({
      intent: `Delete "${mod.title}"?`,
      description: 'All lessons in this module will be removed. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.deletingModuleId.set(mod._id);
    this.courseService.deleteModule(c._id, mod._id).subscribe({
      next: () => {
        this.modules.update((ms) => ms.filter((m) => m._id !== mod._id));
        this.lessons.update((ls) => ls.filter((l) => l.moduleId !== mod._id));
        this.deletingModuleId.set(null);
      },
      error: () => { alert('Failed to delete module.'); this.deletingModuleId.set(null); },
    });
  }

  moveModule(moduleId: string, direction: -1 | 1): void {
    const c = this.course();
    if (!c) return;
    const ms = [...this.modules()];
    const idx = ms.findIndex((m) => m._id === moduleId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ms.length) return;
    [ms[idx], ms[newIdx]] = [ms[newIdx], ms[idx]];
    ms.forEach((m, i) => { ms[i] = { ...m, order: i + 1 }; });
    this.modules.set(ms);
    this.courseService.reorderModules(c._id, ms.map((m) => m._id)).subscribe({
      error: () => {
        this.courseService.getModules(c._id).subscribe({
          next: (fresh) => this.modules.set(fresh.sort((a, b) => a.order - b.order)),
        });
      },
    });
  }

  // ── Lesson management ─────────────────────────────────────────

  /** Open the type-specific add panel from the dropdown, scoped to a module. */
  openAddLesson(type: LessonType, moduleId: string): void {
    this.addLessonModuleId.set(moduleId);
    this.newLessonType.set(type);
    this.newLessonTitle = '';
    this.newLessonTextContent = '';
    this.newLessonStudyQuestions      = [{ text: '' }];
    this.newLessonReflectionQuestions = [{ text: '' }];
    this.newLessonPrayer       = '';
    this.newLessonFurtherStudy = '';
    this.extractingLesson.set(false);
    this.extractLessonError.set(null);
    this.extractLessonSuccess.set(false);
    this.newLessonDocFile.set(null);
    this.parsedDocHtml.set('');
    this.docParseError.set(null);
    this.newDocContentKey.set('');
    this.newAudioUrl.set('');
    this.newAudioKey.set('');
    this.newAudioDuration = 0;
    this.selectedVideoId.set(null);
    this.addLessonError.set(null);
    this.addLessonMenuOpen.set(false);
    this.addLessonMenuModuleId.set(null);
    this.addLessonStage.set('closed');
    this.expandedModuleIds.update((s) => new Set(s).add(moduleId));
    this.showAddLesson.set(true);
  }

  cancelAddLesson(): void {
    this.showAddLesson.set(false);
  }

  // ── Document upload ───────────────────────────────────────────
  onDocFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.newLessonDocFile.set(file);
    this.parsedDocHtml.set('');
    this.docParseError.set(null);
    this.newDocContentKey.set('');
    this.pipelineState.set(null);
    this.parseDocFile(file);
  }

  private parseDocFile(file: File): void {
    this.parsingDoc.set(true);
    this.docParseError.set(null);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      // PDF → upload to S3 and embed
      this.storageService.uploadFile(file, 'courses/documents').subscribe({
        next: (r) => {
          this.newDocContentKey.set(r.fileKey);
          this.parsedDocHtml.set(
            `<div class="lesson-pdf-embed"><embed src="${r.fileUrl}" type="application/pdf" width="100%" height="600px" /></div>`,
          );
          this.parsingDoc.set(false);
        },
        error: () => {
          this.docParseError.set('PDF upload failed. Please try again.');
          this.parsingDoc.set(false);
        },
      });
      return;
    }

    // DOCX → full pipeline: Mammoth → normalise → Bible refs → image upload → beautify
    this.pipeline.process(file, 'courses/documents').subscribe({
      next: (state) => {
        this.pipelineState.set(state);
        if (state.stage === 'complete') {
          if (state.result) {
            this.parsedDocHtml.set(state.result);
          } else {
            this.docParseError.set('No content extracted. Is this a valid .docx file?');
          }
          this.parsingDoc.set(false);
        }
        if (state.stage === 'error') {
          this.docParseError.set(state.error ?? 'Failed to process document. Please try again.');
          this.parsingDoc.set(false);
        }
      },
    });
  }

  // ── Audio upload ──────────────────────────────────────────────
  onAudioFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingAudio.set(true);
    this.addLessonError.set(null);
    this.storageService.uploadFile(file, 'courses/audio').subscribe({
      next: (r) => {
        this.newAudioUrl.set(r.fileUrl);
        this.newAudioKey.set(r.fileKey);
        this.uploadingAudio.set(false);
        // Detect duration
        const audio = new Audio(r.fileUrl);
        audio.addEventListener('loadedmetadata', () => {
          this.newAudioDuration = Math.round(audio.duration) || 0;
        });
      },
      error: () => {
        this.addLessonError.set('Audio upload failed. Please try again.');
        this.uploadingAudio.set(false);
      },
    });
  }

  // ── Validity ──────────────────────────────────────────────────
  get addLessonValid(): boolean {
    if (!this.newLessonTitle.trim()) return false;
    switch (this.newLessonType()) {
      case 'text':  return true;
      case 'video': return !!this.selectedVideoId();
      case 'audio': return !!this.newAudioUrl() && !this.uploadingAudio();
      default:      return false;
    }
  }

  // ── DOCX extraction for lesson ────────────────────────────────
  onLessonDocxFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.extractingLesson.set(true);
    this.extractLessonError.set(null);
    this.extractLessonSuccess.set(false);

    this.courseService.extractDocx(file).subscribe({
      next: (result) => {
        if (result.title && !this.newLessonTitle.trim()) this.newLessonTitle = result.title;
        // Only set text content for text-type lessons - ignore background for video/audio
        if (this.newLessonType() === 'text' && result.backgroundText) this.newLessonTextContent = result.backgroundText;
        if (result.studyQuestions?.length)      this.newLessonStudyQuestions      = result.studyQuestions.map(q => ({ text: q.text }));
        if (result.reflectionQuestions?.length) this.newLessonReflectionQuestions = result.reflectionQuestions.map(q => ({ text: q.text }));
        if (result.prayer)      this.newLessonPrayer       = result.prayer;
        if (result.furtherStudy) this.newLessonFurtherStudy = result.furtherStudy;
        if (!this.newLessonStudyQuestions.length)      this.newLessonStudyQuestions      = [{ text: '' }];
        if (!this.newLessonReflectionQuestions.length) this.newLessonReflectionQuestions = [{ text: '' }];
        this.extractingLesson.set(false);
        this.extractLessonSuccess.set(true);
      },
      error: () => {
        this.extractLessonError.set('Failed to extract document. Make sure it is a valid .docx file.');
        this.extractingLesson.set(false);
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  // ── Question list helpers (lesson form) ───────────────────────
  addLessonStudyQuestion(): void {
    this.newLessonStudyQuestions = [...this.newLessonStudyQuestions, { text: '' }];
  }

  removeLessonStudyQuestion(index: number): void {
    this.newLessonStudyQuestions = this.newLessonStudyQuestions.filter((_, i) => i !== index);
    if (!this.newLessonStudyQuestions.length) this.newLessonStudyQuestions = [{ text: '' }];
  }

  addLessonReflectionQuestion(): void {
    this.newLessonReflectionQuestions = [...this.newLessonReflectionQuestions, { text: '' }];
  }

  removeLessonReflectionQuestion(index: number): void {
    this.newLessonReflectionQuestions = this.newLessonReflectionQuestions.filter((_, i) => i !== index);
    if (!this.newLessonReflectionQuestions.length) this.newLessonReflectionQuestions = [{ text: '' }];
  }

  // ── Edit lesson question list helpers ────────────────────────
  addEditStudyQuestion(): void {
    this.editLessonStudyQuestions = [...this.editLessonStudyQuestions, { text: '' }];
  }

  removeEditStudyQuestion(index: number): void {
    this.editLessonStudyQuestions = this.editLessonStudyQuestions.filter((_, i) => i !== index);
    if (!this.editLessonStudyQuestions.length) this.editLessonStudyQuestions = [{ text: '' }];
  }

  addEditReflectionQuestion(): void {
    this.editLessonReflectionQuestions = [...this.editLessonReflectionQuestions, { text: '' }];
  }

  removeEditReflectionQuestion(index: number): void {
    this.editLessonReflectionQuestions = this.editLessonReflectionQuestions.filter((_, i) => i !== index);
    if (!this.editLessonReflectionQuestions.length) this.editLessonReflectionQuestions = [{ text: '' }];
  }

  // ── Audio replacement for edit form ──────────────────────────
  onEditAudioFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingEditAudio.set(true);
    this.editAudioUploadError.set(null);
    this.storageService.uploadFile(file, 'courses/audio').subscribe({
      next: (r) => {
        this.editNewAudioUrl = r.fileUrl;
        this.editNewAudioKey = r.fileKey;
        this.uploadingEditAudio.set(false);
        const audio = new Audio(r.fileUrl);
        audio.addEventListener('loadedmetadata', () => {
          this.editNewAudioDuration = Math.round(audio.duration) || 0;
        });
      },
      error: () => {
        this.editAudioUploadError.set('Audio upload failed. Please try again.');
        this.uploadingEditAudio.set(false);
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  // ── DOCX re-extraction for edit form ─────────────────────────
  onEditLessonDocxFileChange(event: Event, lessonType: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.extractingEditLesson.set(true);
    this.extractEditLessonError.set(null);
    this.extractEditLessonSuccess.set(false);

    this.courseService.extractDocx(file).subscribe({
      next: (result) => {
        // Only populate text content for text-type lessons - never overwrite video ID or audio URL
        if (lessonType === 'text' && result.backgroundText) this.editLessonContent = result.backgroundText;
        if (result.studyQuestions?.length)      this.editLessonStudyQuestions      = result.studyQuestions.map(q => ({ text: q.text }));
        if (result.reflectionQuestions?.length) this.editLessonReflectionQuestions = result.reflectionQuestions.map(q => ({ text: q.text }));
        if (result.prayer)       this.editLessonPrayer       = result.prayer;
        if (result.furtherStudy) this.editLessonFurtherStudy = result.furtherStudy;
        if (!this.editLessonStudyQuestions.length)      this.editLessonStudyQuestions      = [{ text: '' }];
        if (!this.editLessonReflectionQuestions.length) this.editLessonReflectionQuestions = [{ text: '' }];
        this.extractingEditLesson.set(false);
        this.extractEditLessonSuccess.set(true);
      },
      error: () => {
        this.extractEditLessonError.set('Failed to extract document. Make sure it is a valid .docx file.');
        this.extractingEditLesson.set(false);
      },
    });
    (event.target as HTMLInputElement).value = '';
  }

  trackByIdx(_: number, __: unknown): number { return _; }

  // ── Submit ────────────────────────────────────────────────────
  addLesson(): void {
    if (!this.addLessonValid) return;
    const c        = this.course();
    const type     = this.newLessonType();
    const moduleId = this.addLessonModuleId();
    if (!c || !moduleId) return;

    let content    = '';
    let contentKey: string | undefined;
    let durationSec: number | undefined;

    switch (type) {
      case 'text':
        content = this.newLessonTextContent.trim();
        break;
      case 'video': {
        const cv   = this.selectedVideo()!;
        content    = cv._id;
        contentKey = cv.videoKey;
        break;
      }
      case 'audio':
        content    = this.newAudioUrl();
        contentKey = this.newAudioKey();
        durationSec = this.newAudioDuration || undefined;
        break;
    }

    const filledStudyQs      = this.newLessonStudyQuestions.filter(q => q.text.trim());
    const filledReflectionQs = this.newLessonReflectionQuestions.filter(q => q.text.trim());

    this.addingLesson.set(true);
    this.addLessonError.set(null);

    this.courseService.createLesson(c._id, moduleId, {
      title: this.newLessonTitle.trim(),
      type,
      content,
      contentKey,
      durationSec,
      order: this.lessonsForModule(moduleId).length + 1,
      studyQuestions:      filledStudyQs.length      ? filledStudyQs      : undefined,
      reflectionQuestions: filledReflectionQs.length ? filledReflectionQs : undefined,
      prayer:       this.newLessonPrayer.trim()       || undefined,
      furtherStudy: this.newLessonFurtherStudy.trim() || undefined,
    }).subscribe({
      next: (lesson) => {
        this.lessons.update((ls) => [...ls, lesson]);
        this.modules.update((ms) => ms.map((m) => m._id === moduleId ? { ...m, lessonCount: (m.lessonCount ?? 0) + 1 } : m));
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
    const moduleId = this.lessons().find((l) => l._id === lessonId)?.moduleId;
    this.deletingLessonId.set(lessonId);
    this.courseService.deleteLesson(c._id, lessonId).subscribe({
      next: () => {
        this.lessons.update((ls) => ls.filter((l) => l._id !== lessonId));
        if (moduleId) {
          this.modules.update((ms) => ms.map((m) => m._id === moduleId ? { ...m, lessonCount: Math.max(0, (m.lessonCount ?? 1) - 1) } : m));
        }
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
    }
  }

  startEditLesson(lesson: Lesson): void {
    this.editLessonTitle       = lesson.title;
    this.editLessonDescription = lesson.description ?? '';

    // Content - only editable for text lessons
    this.editLessonContent = lesson.type === 'text' ? lesson.content : '';

    // Video / audio content replacement (reset)
    this.editSelectedVideoId.set(lesson.type === 'video' ? lesson.content : null);
    this.editNewAudioUrl      = '';
    this.editNewAudioKey      = '';
    this.editNewAudioDuration = 0;
    this.editAudioUploadError.set(null);

    // Study guide fields
    this.editLessonStudyQuestions      = lesson.studyQuestions?.length
      ? lesson.studyQuestions.map(q => ({ text: q.text }))
      : [{ text: '' }];
    this.editLessonReflectionQuestions = lesson.reflectionQuestions?.length
      ? lesson.reflectionQuestions.map(q => ({ text: q.text }))
      : [{ text: '' }];
    this.editLessonPrayer       = lesson.prayer       ?? '';
    this.editLessonFurtherStudy = lesson.furtherStudy ?? '';

    this.extractingEditLesson.set(false);
    this.extractEditLessonError.set(null);
    this.extractEditLessonSuccess.set(false);

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

    const filledStudyQs      = this.editLessonStudyQuestions.filter(q => q.text.trim());
    const filledReflectionQs = this.editLessonReflectionQuestions.filter(q => q.text.trim());

    // Resolve content + contentKey per type
    let updatedContent:    string | undefined;
    let updatedContentKey: string | undefined;

    if (lesson.type === 'text') {
      updatedContent = this.editLessonContent || undefined;
    } else if (lesson.type === 'video') {
      const vid = this.editSelectedVideoId();
      if (vid && vid !== lesson.content) updatedContent = vid;
    } else if (lesson.type === 'audio') {
      if (this.editNewAudioUrl) {
        updatedContent    = this.editNewAudioUrl;
        updatedContentKey = this.editNewAudioKey || undefined;
      }
    }

    this.courseService.updateLesson(c._id, lesson._id, {
      title:       this.editLessonTitle.trim(),
      ...(updatedContent    !== undefined && { content: updatedContent }),
      ...(updatedContentKey !== undefined && { contentKey: updatedContentKey }),
      description: this.editLessonDescription.trim() || undefined,
      studyQuestions:      filledStudyQs.length      ? filledStudyQs      : [],
      reflectionQuestions: filledReflectionQs.length ? filledReflectionQs : [],
      prayer:       this.editLessonPrayer.trim()       || undefined,
      furtherStudy: this.editLessonFurtherStudy.trim() || undefined,
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

  // ── Move lesson up / down (within its module) ─────────────────
  moveLesson(lessonId: string, moduleId: string, direction: -1 | 1): void {
    const c = this.course();
    if (!c) return;

    // Reorder only within the lesson's module.
    const group = this.lessonsForModule(moduleId);
    const idx = group.findIndex((l) => l._id === lessonId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= group.length) return;

    [group[idx], group[newIdx]] = [group[newIdx], group[idx]];
    const reordered = group.map((l, i) => ({ ...l, order: i + 1 }));

    // Merge the reordered module group back into the full lesson list.
    this.lessons.update((ls) =>
      ls.map((l) => reordered.find((r) => r._id === l._id) ?? l),
    );

    const ids = reordered.map((l) => l._id);
    this.courseService.reorderLessons(c._id, moduleId, ids).subscribe({
      error: () => {
        // Revert on error by reloading
        this.courseService.getLessons(c._id).subscribe({
          next: (fresh) => this.lessons.set(fresh.sort((a, b) => a.order - b.order)),
        });
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
}
