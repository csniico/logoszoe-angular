import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Video } from '../models/video.model';

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/videos`;

  getAll(): Observable<Video[]> {
    return this.http.get<Video[]>(this.base);
  }

  getByCategory(category: string): Observable<Video[]> {
    return this.http.get<Video[]>(`${this.base}/${category}`);
  }

  create(data: Partial<Video>): Observable<Video> {
    return this.http.post<Video>(this.base, data);
  }

  delete(id: string): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.base}/${id}`);
  }
}
