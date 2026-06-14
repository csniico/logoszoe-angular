import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Prayer } from '../models/prayer.model';

@Injectable({ providedIn: 'root' })
export class PrayerService {
  private readonly http = inject(HttpClient);
  /** Admin-only endpoint - AdminGuard on server. */
  private readonly base = `${environment.apiUrl}/admin/prayers`;

  getAll(): Observable<Prayer[]> {
    return this.http.get<Prayer[]>(this.base);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
