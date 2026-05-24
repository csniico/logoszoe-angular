import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint. */
  private readonly base = `${environment.apiUrl}/shop/products`;
  /** Admin write endpoint — AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/shop/products`;

  getAll(): Observable<Product[]> {
    return this.http.get<Product[]>(this.base);
  }

  getById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.base}/${id}`);
  }

  create(data: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(this.adminBase, data);
  }

  update(id: string, patch: Partial<Product>): Observable<Product> {
    return this.http.patch<Product>(`${this.adminBase}/${id}`, patch);
  }

  delete(id: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${this.adminBase}/${id}`);
  }
}
