import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Donation } from '../models/donation.model';

@Injectable({ providedIn: 'root' })
export class DonationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/donations`;

  /** All donations across all users, newest first. */
  getAll(): Observable<Donation[]> {
    return this.http.get<Donation[]>(this.base);
  }

  /** Donations for a single user, newest first. */
  getByUser(userId: string): Observable<Donation[]> {
    return this.http.get<Donation[]>(`${this.base}/user/${userId}`);
  }
}
