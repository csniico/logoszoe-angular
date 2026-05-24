import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, UserRole } from '../models/user.model';

export type CreateUserRole = 'user' | 'admin' | 'superadmin';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  getAll(): Observable<User[]> {
    return this.http.get<User[]>(`${this.base}/all`);
  }

  /** Create an app user (goes to the users collection). */
  create(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    role: UserRole;
  }): Observable<User> {
    return this.http.post<User>(this.base, data);
  }

  /** Create an admin-panel user (goes to the adminUsers collection). */
  createAdmin(data: {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'superadmin';
  }): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/admin/users`, data);
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.base}/profile`);
  }

  updateRole(id: string, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.base}/${id}/role`, { role });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
