import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StorageAsset, StorageStats } from '../models/storage-asset.model';
import { MigrationJob } from '../models/migration-job.model';

@Injectable({ providedIn: 'root' })
export class StorageCatalogService {
  private readonly http = inject(HttpClient);
  /** Admin storage endpoint — AdminGuard / SuperAdminGuard on server. */
  private readonly base = `${environment.apiUrl}/admin/storage`;

  listAssets(resourceType?: string): Observable<StorageAsset[]> {
    if (resourceType) {
      return this.http.get<StorageAsset[]>(`${this.base}/assets`, {
        params: { type: resourceType },
      });
    }
    return this.http.get<StorageAsset[]>(`${this.base}/assets`);
  }

  getStats(): Observable<StorageStats> {
    return this.http.get<StorageStats>(`${this.base}/stats`);
  }

  sync(): Observable<{ synced: number; collections: string[] }> {
    return this.http.post<{ synced: number; collections: string[] }>(
      `${this.base}/sync`,
      {},
    );
  }

  startMigrate(): Observable<{ jobId: string; total: number }> {
    return this.http.post<{ jobId: string; total: number }>(`${this.base}/migrate`, {});
  }

  getMigrationJob(id: string): Observable<MigrationJob> {
    return this.http.get<MigrationJob>(`${this.base}/migration-jobs/${id}`);
  }

  listMigrationJobs(): Observable<MigrationJob[]> {
    return this.http.get<MigrationJob[]>(`${this.base}/migration-jobs`);
  }
}
