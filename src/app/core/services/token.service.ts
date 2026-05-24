import { Injectable } from '@angular/core';
import { AdminUser } from '../models/auth.model';

const ADMIN_TOKEN_KEY = 'lz_admin_token';
const ADMIN_USER_KEY  = 'lz_admin_user';

@Injectable({ providedIn: 'root' })
export class TokenService {
  // ── Admin token ──────────────────────────────────────────────────────────

  getAccessToken(): string | null {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  setAccessToken(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  }

  // ── Admin user ───────────────────────────────────────────────────────────

  getAdminUser(): AdminUser | null {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminUser;
    } catch {
      return null;
    }
  }

  setAdminUser(user: AdminUser): void {
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
  }

  // ── Session helpers ──────────────────────────────────────────────────────

  hasToken(): boolean {
    return !!this.getAccessToken();
  }

  clearTokens(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  }
}
