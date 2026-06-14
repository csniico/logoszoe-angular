import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';
import { AdminLoginRequest, AdminLoginResponse, AdminUser } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http         = inject(HttpClient);
  private readonly router       = inject(Router);
  private readonly tokenService = inject(TokenService);
  private readonly base         = environment.apiUrl;

  private readonly _currentAdmin = signal<AdminUser | null>(null);
  readonly currentAdmin = this._currentAdmin.asReadonly();
  readonly isLoggedIn   = computed(() => this._currentAdmin() !== null);
  readonly isSuperAdmin = computed(() => this._currentAdmin()?.role === 'superadmin');

  /** Restore session from localStorage on app start - no network call needed. */
  restoreSession(): void {
    const admin = this.tokenService.getAdminUser();
    if (admin && this.tokenService.hasToken()) {
      this._currentAdmin.set(admin);
    }
  }

  signIn(payload: AdminLoginRequest): Observable<AdminLoginResponse> {
    return this.http
      .post<AdminLoginResponse>(`${this.base}/admin/auth/login`, payload)
      .pipe(tap((res) => this.handleAuthResponse(res)));
  }

  updateProfile(name: string): Observable<AdminUser> {
    return this.http
      .patch<AdminUser>(`${this.base}/admin/auth/me`, { name })
      .pipe(tap((updated) => {
        const prev = this._currentAdmin();
        if (prev) {
          const next = { ...prev, name: updated.name };
          this._currentAdmin.set(next);
          this.tokenService.setAdminUser(next);
        }
      }));
  }

  /**
   * Creates a user in the adminUsers collection (dashboard access).
   * Calls POST /admin/auth/register - distinct from POST /admin/users
   * which writes to the regular app users collection.
   */
  registerAdminUser(data: {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'superadmin';
  }): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}/admin/auth/register`, data);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `${this.base}/admin/auth/me/password`,
      { currentPassword, newPassword },
    );
  }

  signOut(): void {
    this._currentAdmin.set(null);
    this.tokenService.clearTokens();
    void this.router.navigate(['/auth/login']);
  }

  private handleAuthResponse(res: AdminLoginResponse): void {
    this.tokenService.setAccessToken(res.access_token);
    this.tokenService.setAdminUser(res.admin);
    this._currentAdmin.set(res.admin);
  }
}
