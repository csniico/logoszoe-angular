// ── Enums (mirror backend) ─────────────────────────────────────────────────────

export type CourseModule = 'foundation' | 'intermediate' | 'advanced';

export const COURSE_MODULES: { value: CourseModule; label: string }[] = [
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
  module: CourseModule;
  imageUrl?: string;
  imageKey?: string;
  description?: string;
  lessonCount?: number;
  totalDurationSec?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Lesson ────────────────────────────────────────────────────────────────────

export type LessonType = 'text' | 'video' | 'audio';

export interface Lesson {
  _id: string;
  courseId: string;
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
