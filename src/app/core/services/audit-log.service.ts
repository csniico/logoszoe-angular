import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuditLog, AuditLogFilters } from '../models/audit-log.model';
import { PaginatedResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/audit-logs`;

  getAll(
    page = 1,
    limit = 50,
    filters: AuditLogFilters = {},
  ): Observable<PaginatedResponse<AuditLog>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    if (filters.method)  params = params.set('method',  filters.method);
    if (filters.path)    params = params.set('path',    filters.path);
    if (filters.adminId) params = params.set('adminId', filters.adminId);
    if (filters.userId)  params = params.set('userId',  filters.userId);
    if (filters.status)  params = params.set('status',  filters.status);
    if (filters.from)    params = params.set('from',    filters.from);
    if (filters.to)      params = params.set('to',      filters.to);

    return this.http.get<PaginatedResponse<AuditLog>>(this.base, { params });
  }
}
