import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course, Lesson, Question, Submission, EnrichedSubmission } from '../models/course.model';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/courses`;

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(this.base);
  }

  getById(id: string): Observable<Course> {
    return this.http.get<Course>(`${this.base}/${id}`);
  }

  create(data: Partial<Course>): Observable<Course> {
    return this.http.post<Course>(this.base, data);
  }

  update(id: string, patch: Partial<Course>): Observable<Course> {
    return this.http.patch<Course>(`${this.base}/${id}`, patch);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getLessons(courseId: string): Observable<Lesson[]> {
    return this.http.get<Lesson[]>(`${this.base}/${courseId}/lessons`);
  }

  createLesson(courseId: string, data: Partial<Lesson>): Observable<Lesson> {
    return this.http.post<Lesson>(`${this.base}/${courseId}/lessons`, data);
  }

  updateLesson(courseId: string, lessonId: string, patch: Partial<Lesson>): Observable<Lesson> {
    return this.http.patch<Lesson>(`${this.base}/${courseId}/lessons/${lessonId}`, patch);
  }

  deleteLesson(courseId: string, lessonId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${courseId}/lessons/${lessonId}`);
  }

  reorderLessons(courseId: string, lessonIds: string[]): Observable<void> {
    return this.http.patch<void>(`${this.base}/${courseId}/lessons/reorder`, { lessonIds });
  }

  // ── Questions ──────────────────────────────────────────────────────────

  getQuestions(courseId: string, lessonId: string): Observable<Question[]> {
    return this.http.get<Question[]>(`${this.base}/${courseId}/lessons/${lessonId}/questions`);
  }

  createQuestion(courseId: string, lessonId: string, data: Partial<Question>): Observable<Question> {
    return this.http.post<Question>(`${this.base}/${courseId}/lessons/${lessonId}/questions`, data);
  }

  updateQuestion(courseId: string, lessonId: string, questionId: string, patch: Partial<Question>): Observable<Question> {
    return this.http.patch<Question>(`${this.base}/${courseId}/lessons/${lessonId}/questions/${questionId}`, patch);
  }

  deleteQuestion(courseId: string, lessonId: string, questionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${courseId}/lessons/${lessonId}/questions/${questionId}`);
  }

  // ── Submissions ────────────────────────────────────────────────────────

  getSubmissions(courseId: string, lessonId: string): Observable<Submission[]> {
    return this.http.get<Submission[]>(`${this.base}/${courseId}/lessons/${lessonId}/submissions`);
  }

  getAllSubmissions(filters: { courseId?: string; lessonId?: string } = {}): Observable<EnrichedSubmission[]> {
    const params: Record<string, string> = {};
    if (filters.courseId) params['courseId'] = filters.courseId;
    if (filters.lessonId) params['lessonId'] = filters.lessonId;
    return this.http.get<EnrichedSubmission[]>(`${this.base}/submissions`, { params });
  }
}
