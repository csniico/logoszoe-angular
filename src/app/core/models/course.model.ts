export type LessonType = 'text' | 'video';
export type QuestionType = 'multiple_choice' | 'text_input';

export interface QuestionOption {
  label: string;
  value: string;
}

export interface Question {
  _id: string;
  courseId: string;
  lessonId: string;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correctOption?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubmissionResponse {
  questionId: string;
  userResponse: string;
}

export interface Submission {
  _id: string;
  courseId: string;
  lessonId: string;
  userId: string;
  responses: SubmissionResponse[];
  createdAt?: string;
  updatedAt?: string;
}

export interface EnrichedResponse extends SubmissionResponse {
  questionText: string;
  questionType: QuestionType;
  correctOption?: string;
  /** true/false for multiple_choice; null for text_input */
  isCorrect: boolean | null;
}

export interface EnrichedSubmission extends Omit<Submission, 'responses'> {
  responses: EnrichedResponse[];
}

export interface Lesson {
  _id: string;
  courseId: string;
  order: number;
  title: string;
  type: LessonType;
  content: string;
  contentKey?: string;
  durationSec?: number;
  completionsCount?: number;
}

export interface CourseProgress {
  totalLessons: number;
  lessonsCompleted: number;
  completedLessonIds: string[];
}

export interface Course {
  _id: string;
  title: string;
  description: string;
  imageUrl?: string;
  imageKey?: string;
  lessonCount?: number;
  totalDurationSec?: number;
  createdAt?: string;
  updatedAt?: string;
}
