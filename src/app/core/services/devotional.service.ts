import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Devotional } from '../models/devotional.model';
import { PaginatedResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class DevotionalService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint (paginated). */
  private readonly base = `${environment.apiUrl}/devotionals`;
  /** Admin write endpoint — AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/devotionals`;

  getAll(page = 1, limit = 25): Observable<PaginatedResponse<Devotional>> {
    return this.http.get<PaginatedResponse<Devotional>>(this.base, {
      params: { page: String(page), limit: String(limit) },
    });
  }

  getById(id: string): Observable<Devotional> {
    return this.http.get<Devotional>(`${this.base}/${id}`);
  }

  create(data: Partial<Devotional>): Observable<Devotional> {
    return this.http.post<Devotional>(this.adminBase, data);
  }

  update(id: string, patch: Partial<Devotional>): Observable<Devotional> {
    return this.http.patch<Devotional>(`${this.adminBase}/${id}`, patch);
  }

  delete(id: string): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${this.adminBase}/${id}`);
  }
}
