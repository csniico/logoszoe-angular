import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  TiktokConfigCheck,
  TiktokStatus,
  TiktokSyncResult,
  TiktokVideo,
} from '../models/tiktok.model';
import { PaginatedResponse } from '../models/paginated-response.model';

@Injectable({ providedIn: 'root' })
export class TiktokService {
  private readonly http = inject(HttpClient);
  /** Public read endpoint. */
  private readonly base = `${environment.apiUrl}/tiktok`;
  /** Admin write endpoint - AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/tiktok`;

  getStatus(): Observable<TiktokStatus> {
    return this.http.get<TiktokStatus>(`${this.adminBase}/status`);
  }

  /** Setup diagnostics - returns the redirect URI the backend will send. */
  getConfigCheck(): Observable<TiktokConfigCheck> {
    return this.http.get<TiktokConfigCheck>(`${this.adminBase}/config-check`);
  }

  /** Admin listing, including videos hidden from the public feed. */
  getVideos(page = 1, limit = 25): Observable<PaginatedResponse<TiktokVideo>> {
    return this.http.get<PaginatedResponse<TiktokVideo>>(
      `${this.adminBase}/videos`,
      { params: { page: String(page), limit: String(limit) } },
    );
  }

  /**
   * The consent URL, fetched as JSON rather than followed as a 302 — an XHR
   * cannot carry the admin bearer token through TikTok's cross-origin
   * redirect, so the browser must navigate to it top-level instead.
   */
  getAuthorizeUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.adminBase}/oauth/url`);
  }

  /** `full` crawls every page instead of stopping at the first with no new videos. */
  sync(full = false): Observable<TiktokSyncResult> {
    return this.http.post<TiktokSyncResult>(
      `${this.adminBase}/sync`,
      {},
      { params: { full: String(full) } },
    );
  }

  refreshCovers(): Observable<{ refreshed: number }> {
    return this.http.post<{ refreshed: number }>(
      `${this.adminBase}/refresh-covers`,
      {},
    );
  }

  setVisibility(videoId: string, isVisible: boolean): Observable<TiktokVideo> {
    return this.http.patch<TiktokVideo>(`${this.adminBase}/videos/${videoId}`, {
      isVisible,
    });
  }

  disconnect(): Observable<{ disconnected: boolean }> {
    return this.http.delete<{ disconnected: boolean }>(
      `${this.adminBase}/disconnect`,
    );
  }
}
