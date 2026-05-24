export interface AuditLog {
  _id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  userId?: string;
  adminId?: string;
  role?: string;
  timestamp: string;
}

export interface AuditLogFilters {
  method?: string;
  path?: string;
  adminId?: string;
  userId?: string;
  status?: string;
  from?: string;
  to?: string;
}
