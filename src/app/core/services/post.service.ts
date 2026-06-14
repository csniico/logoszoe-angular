import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Post } from '../models/post.model';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);
  /** Admin-only endpoint - AdminGuard on server. */
  private readonly base = `${environment.apiUrl}/admin/posts`;

  getFeed(cursor?: string, limit?: number): Observable<Post[]> {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    if (limit != null) params = params.set('limit', String(limit));
    return this.http.get<Post[]>(this.base, { params });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
