import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Course,
  Lesson,
  ExtractedLessonContent,
} from '../models/course.model';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint — no guard on server. */
  private readonly base = `${environment.apiUrl}/courses`;
  /** Admin write endpoint — AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/courses`;

  // ── Courses ────────────────────────────────────────────────────────────────

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(this.base);
  }

  getById(id: string): Observable<Course> {
    return this.http.get<Course>(`${this.base}/${id}`);
  }

  create(data: Partial<Course>): Observable<Course> {
    return this.http.post<Course>(this.adminBase, data);
  }

  update(id: string, patch: Partial<Course>): Observable<Course> {
    return this.http.patch<Course>(`${this.adminBase}/${id}`, patch);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/${id}`);
  }

  // ── DOCX extraction ────────────────────────────────────────────────────────

  extractDocx(file: File): Observable<ExtractedLessonContent> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ExtractedLessonContent>(`${this.adminBase}/extract-docx`, form);
  }

  // ── Lessons ────────────────────────────────────────────────────────────────

  getLessons(courseId: string): Observable<Lesson[]> {
    return this.http.get<Lesson[]>(`${this.base}/${courseId}/lessons`);
  }

  createLesson(courseId: string, data: Partial<Lesson>): Observable<Lesson> {
    return this.http.post<Lesson>(`${this.adminBase}/${courseId}/lessons`, data);
  }

  updateLesson(courseId: string, lessonId: string, patch: Partial<Lesson>): Observable<Lesson> {
    return this.http.patch<Lesson>(`${this.adminBase}/${courseId}/lessons/${lessonId}`, patch);
  }

  deleteLesson(courseId: string, lessonId: string): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/${courseId}/lessons/${lessonId}`);
  }

  reorderLessons(courseId: string, lessonIds: string[]): Observable<void> {
    return this.http.patch<void>(`${this.adminBase}/${courseId}/lessons/reorder`, { lessonIds });
  }
}
