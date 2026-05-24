import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SearchResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/search`;

  search<T>(q: string, scope: string, page = 1, limit = 25): Observable<SearchResponse<T>> {
    return this.http.get<SearchResponse<T>>(this.base, {
      params: { q, scope, page: String(page), limit: String(limit) },
    });
  }
}
