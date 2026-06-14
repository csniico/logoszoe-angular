import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, UserRole } from '../models/user.model';

export type CreateUserRole = 'user' | 'admin' | 'superadmin';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  /** User JWT endpoint - used only for reading the signed-in admin's own profile. */
  private readonly base = `${environment.apiUrl}/users`;
  /** Admin endpoint - AdminGuard on server. */
  private readonly adminBase = `${environment.apiUrl}/admin/users`;

  getAll(): Observable<User[]> {
    return this.http.get<User[]>(`${this.adminBase}/all`);
  }

  /** Create a user via the admin endpoint. Backend supports roles 'user' and 'admin'. */
  create(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    role: string;
  }): Observable<User> {
    return this.http.post<User>(this.adminBase, data);
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.base}/profile`);
  }

  updateRole(id: string, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.adminBase}/${id}/role`, { role });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.adminBase}/${id}`);
  }
}
