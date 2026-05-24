import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Podcast, PodcastCategory } from '../models/podcast.model';
import { PaginatedResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class PodcastService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/podcasts`;

  getAll(page = 1, limit = 25): Observable<PaginatedResponse<Podcast>> {
    return this.http.get<PaginatedResponse<Podcast>>(this.base, {
      params: { page: String(page), limit: String(limit) },
    });
  }

  getById(id: string): Observable<Podcast> {
    return this.http.get<Podcast>(`${this.base}/id/${id}`);
  }

  getByCategory(category: PodcastCategory): Observable<Podcast[]> {
    return this.http.get<Podcast[]>(`${this.base}/${category}`);
  }

  create(data: Partial<Podcast>): Observable<Podcast> {
    return this.http.post<Podcast>(this.base, data);
  }

  update(id: string, patch: Partial<Podcast>): Observable<Podcast> {
    return this.http.patch<Podcast>(`${this.base}/${id}`, patch);
  }

  delete(id: string): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.base}/${id}`);
  }
}
