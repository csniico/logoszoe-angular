import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileKey: string;
  fileUrl: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/storage`;

  getPresignedUrl(key: string, mimeType: string): Observable<PresignedUrlResponse> {
    return this.http.post<PresignedUrlResponse>(`${this.base}/presigned-url`, {
      key,
      mimeType,
    });
  }

  /** Upload file directly to S3 via presigned PUT URL. Returns the presigned response for downstream use. */
  uploadFile(file: File, keyPrefix: string): Observable<PresignedUrlResponse> {
    const ext = file.name.includes('.') ? file.name.split('.').pop()! : '';
    const key = ext ? `${keyPrefix}.${ext}` : keyPrefix;

    return this.getPresignedUrl(key, file.type).pipe(
      switchMap((presigned) =>
        // PUT directly to S3 — skip the auth interceptor by using a plain fetch
        // (Authorization header would break the AWS presigned signature)
        new Observable<PresignedUrlResponse>((obs) => {
          fetch(presigned.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          })
            .then((res) => {
              if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
              obs.next(presigned);
              obs.complete();
            })
            .catch((err: unknown) => obs.error(err));
        }),
      ),
    );
  }
}
