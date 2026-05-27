import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubmissionListItem, SubmissionDetail, Remark } from '../models/submission.model';

@Injectable({ providedIn: 'root' })
export class SubmissionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/submissions`;

  getAll(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    lessonId?: string;
  }): Observable<{ data: SubmissionListItem[]; total: number; page: number; totalPages: number }> {
    let httpParams = new HttpParams();
    if (params.page !== undefined) httpParams = httpParams.set('page', String(params.page));
    if (params.limit !== undefined) httpParams = httpParams.set('limit', String(params.limit));
    if (params.courseId) httpParams = httpParams.set('courseId', params.courseId);
    if (params.lessonId) httpParams = httpParams.set('lessonId', params.lessonId);

    return this.http.get<{ data: SubmissionListItem[]; total: number; page: number; totalPages: number }>(
      this.base,
      { params: httpParams },
    );
  }

  getById(id: string): Observable<{ submission: SubmissionDetail; remarks: Remark[] }> {
    return this.http.get<{ submission: SubmissionDetail; remarks: Remark[] }>(`${this.base}/${id}`);
  }

  addRemark(submissionId: string, content: string): Observable<Remark> {
    return this.http.post<Remark>(`${this.base}/${submissionId}/remarks`, { content });
  }
}
