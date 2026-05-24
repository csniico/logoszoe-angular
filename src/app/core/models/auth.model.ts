import { User } from './user.model';

// ── App-user auth (kept for reference / future use) ─────────────────────────

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
  refreshToken: string;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstname: string;
  lastname?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ── Admin auth ───────────────────────────────────────────────────────────────

export type AdminRole = 'admin' | 'superadmin';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

export interface AdminLoginResponse {
  access_token: string;
  admin: AdminUser;
}

export interface AdminLoginRequest {
  email: string;
  password: string;
}
