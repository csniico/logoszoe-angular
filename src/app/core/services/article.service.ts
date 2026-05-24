import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Article } from '../models/article.model';

export interface ArticleDetailResponse {
  article: Article;
  relatedArticles: Article[];
}

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/articles`;

  getAll(): Observable<Article[]> {
    return this.http.get<Article[]>(this.base);
  }

  getBySlug(slug: string): Observable<ArticleDetailResponse> {
    return this.http.get<ArticleDetailResponse>(`${this.base}/${slug}`);
  }

  getByCategorySlug(slug: string): Observable<Article[]> {
    return this.http.get<Article[]>(`${this.base}/category/${slug}`);
  }

  create(data: Partial<Article> & { title: string }): Observable<Article> {
    return this.http.post<Article>(this.base, data);
  }

  update(id: string, patch: Partial<Article>): Observable<Article> {
    return this.http.patch<Article>(`${this.base}/${id}`, patch);
  }

  delete(id: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${this.base}/${id}`);
  }
}
