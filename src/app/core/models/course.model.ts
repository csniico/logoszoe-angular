// ── Enums (mirror backend) ─────────────────────────────────────────────────────

/** Difficulty level of a course (formerly `module`). */
export type CourseLevel = 'foundation' | 'intermediate' | 'advanced';

export const COURSE_LEVELS: { value: CourseLevel; label: string }[] = [
  { value: 'foundation',   label: 'Foundation'   },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced'     },
];

export type LessonContentType = 'text' | 'video' | 'audio';

export const LESSON_CONTENT_TYPES: { value: LessonContentType; label: string }[] = [
  { value: 'text',  label: 'Text'  },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
];

// ── Embedded question ──────────────────────────────────────────────────────────

export interface EmbeddedQuestion {
  text: string;
}

// ── Extracted DOCX content (lesson-level) ─────────────────────────────────────

export interface ExtractedLessonContent {
  title: string;
  backgroundText: string;
  studyQuestions: EmbeddedQuestion[];
  reflectionQuestions: EmbeddedQuestion[];
  prayer: string;
  furtherStudy: string;
}

// ── Course ────────────────────────────────────────────────────────────────────

export interface Course {
  _id: string;
  title: string;
  level: CourseLevel;
  imageUrl?: string;
  imageKey?: string;
  description?: string;
  lessonCount?: number;
  totalDurationSec?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Module (bundle of lessons within a course) ──────────────────────────────────

export interface CourseModule {
  _id: string;
  courseId: string;
  title: string;
  order: number;
  description?: string;
  imageUrl?: string;
  imageKey?: string;
  /** Convenience count returned by GET /courses/:id/modules. */
  lessonCount?: number;
}

// ── Lesson ────────────────────────────────────────────────────────────────────

export type LessonType = 'text' | 'video' | 'audio';

export interface Lesson {
  _id: string;
  courseId: string;
  /** The module this lesson belongs to. */
  moduleId?: string;
  order: number;
  title: string;
  type: LessonType;
  content: string;
  contentKey?: string;
  durationSec?: number;
  description?: string;
  completionsCount?: number;
  studyQuestions?: EmbeddedQuestion[];
  reflectionQuestions?: EmbeddedQuestion[];
  prayer?: string;
  furtherStudy?: string;
}

// ── Course progress ───────────────────────────────────────────────────────────

export interface CourseProgress {
  totalLessons: number;
  lessonsCompleted: number;
  completedLessonIds: string[];
}
