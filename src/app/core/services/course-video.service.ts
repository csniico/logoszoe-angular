import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CourseVideo } from '../models/course-video.model';

@Injectable({ providedIn: 'root' })
export class CourseVideoService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint. */
  private readonly base = `${environment.apiUrl}/course-videos`;
  /** Admin write endpoint — AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/course-videos`;

  getAll(): Observable<CourseVideo[]> {
    return this.http.get<CourseVideo[]>(this.base);
  }

  getById(id: string): Observable<CourseVideo> {
    return this.http.get<CourseVideo>(`${this.base}/${id}`);
  }

  create(data: Partial<CourseVideo>): Observable<CourseVideo> {
    return this.http.post<CourseVideo>(this.adminBase, data);
  }

  update(id: string, patch: Pick<CourseVideo, 'title'> & Partial<Pick<CourseVideo, 'description'>>): Observable<CourseVideo> {
    return this.http.patch<CourseVideo>(`${this.adminBase}/${id}`, patch);
  }

  delete(id: string): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.adminBase}/${id}`);
  }
}
