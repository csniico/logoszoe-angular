import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Category } from '../models/category.model';

interface CategoriesResponse {
  categories: Category[];
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/categories`;

  getAll(): Observable<CategoriesResponse> {
    return this.http.get<CategoriesResponse>(this.base);
  }

  getById(id: string): Observable<Category> {
    return this.http.get<Category>(`${this.base}/${id}`);
  }

  updateField(id: string, patch: Partial<Category>): Observable<Category> {
    return this.http.patch<Category>(`${this.base}/${id}`, patch);
  }

  create(payload: Partial<Category>): Observable<Category> {
    return this.http.post<Category>(this.base, payload);
  }

  delete(id: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${this.base}/${id}`);
  }

  syncArticles(id: string, articleIds: string[]): Observable<Category> {
    return this.http.patch<Category>(`${this.base}/${id}/sync-articles`, {
      articleIds,
    });
  }
}
