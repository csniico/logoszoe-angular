import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AnalyticsOverview, AnalyticsTimeseries, TimeRange } from '../models/analytics.model';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/analytics`;

  getOverview(): Observable<AnalyticsOverview> {
    return this.http.get<AnalyticsOverview>(`${this.base}/overview`);
  }

  getTimeseries(range: TimeRange): Observable<AnalyticsTimeseries> {
    return this.http.get<AnalyticsTimeseries>(`${this.base}/timeseries`, { params: { range } });
  }
}
