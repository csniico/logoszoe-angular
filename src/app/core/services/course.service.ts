import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Course,
  CourseModule,
  Lesson,
  ExtractedLessonContent,
} from '../models/course.model';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint - no guard on server. */
  private readonly base = `${environment.apiUrl}/courses`;
  /** Admin write endpoint - AdminGuard on server. */
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
    return this.http.patch<Course>(`${this.adminBase}/${id}`, pruneEmpty(patch));
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

  // ── Modules ──────────────────────────────────────────────────────────────

  getModules(courseId: string): Observable<CourseModule[]> {
    return this.http.get<CourseModule[]>(`${this.base}/${courseId}/modules`);
  }

  createModule(courseId: string, data: Partial<CourseModule>): Observable<CourseModule> {
    return this.http.post<CourseModule>(`${this.adminBase}/${courseId}/modules`, data);
  }

  updateModule(courseId: string, moduleId: string, patch: Partial<CourseModule>): Observable<CourseModule> {
    return this.http.patch<CourseModule>(`${this.adminBase}/${courseId}/modules/${moduleId}`, pruneEmpty(patch));
  }

  deleteModule(courseId: string, moduleId: string): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/${courseId}/modules/${moduleId}`);
  }

  reorderModules(courseId: string, moduleIds: string[]): Observable<void> {
    return this.http.patch<void>(`${this.adminBase}/${courseId}/modules/reorder`, { moduleIds });
  }

  // ── Lessons ────────────────────────────────────────────────────────────────

  /** Returns ALL lessons for a course (across modules); group by `moduleId` client-side. */
  getLessons(courseId: string): Observable<Lesson[]> {
    return this.http.get<Lesson[]>(`${this.base}/${courseId}/lessons`);
  }

  createLesson(courseId: string, moduleId: string, data: Partial<Lesson>): Observable<Lesson> {
    return this.http.post<Lesson>(
      `${this.adminBase}/${courseId}/modules/${moduleId}/lessons`,
      data,
    );
  }

  updateLesson(courseId: string, lessonId: string, patch: Partial<Lesson>): Observable<Lesson> {
    return this.http.patch<Lesson>(
      `${this.adminBase}/${courseId}/lessons/${lessonId}`,
      pruneEmpty(patch),
    );
  }

  deleteLesson(courseId: string, lessonId: string): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/${courseId}/lessons/${lessonId}`);
  }

  /** Reorder lessons within a single module. */
  reorderLessons(courseId: string, moduleId: string, lessonIds: string[]): Observable<void> {
    return this.http.patch<void>(
      `${this.adminBase}/${courseId}/modules/${moduleId}/lessons/reorder`,
      { lessonIds },
    );
  }
}

/**
 * Drop `null`/`undefined` values from a PATCH payload so a partial update never
 * blanks a field the user didn't touch (e.g. an untouched `type` control
 * sending `null`, which blows up server-side required validation).
 */
function pruneEmpty<T extends Record<string, unknown>>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}
