import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../../core/services/audit-log.service';
import { AuditLog, AuditLogFilters } from '../../core/models/audit-log.model';

const PAGE_SIZE = 50;

const METHOD_COLORS: Record<string, string> = {
  GET:    'method--get',
  POST:   'method--post',
  PATCH:  'method--patch',
  PUT:    'method--put',
  DELETE: 'method--delete',
};

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-logs.html',
  styleUrl: './audit-logs.scss',
})
export class AuditLogsComponent implements OnInit {
  private readonly auditLogService = inject(AuditLogService);

  readonly logs        = signal<AuditLog[]>([]);
  readonly loading     = signal(true);
  readonly error       = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly totalPages  = signal(1);
  readonly total       = signal(0);

  // ── Filters ────────────────────────────────────────────────────
  filterMethod  = '';
  filterPath    = '';
  filterStatus  = '';
  filterAdminId = '';
  filterUserId  = '';
  filterFrom    = '';
  filterTo      = '';

  readonly methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(null);

    const filters: AuditLogFilters = {
      method:  this.filterMethod  || undefined,
      path:    this.filterPath    || undefined,
      status:  this.filterStatus  || undefined,
      adminId: this.filterAdminId || undefined,
      userId:  this.filterUserId  || undefined,
      from:    this.filterFrom    || undefined,
      to:      this.filterTo      || undefined,
    };

    this.auditLogService.getAll(page, PAGE_SIZE, filters).subscribe({
      next: (res) => {
        this.logs.set(res.data);
        this.currentPage.set(res.page);
        this.totalPages.set(res.totalPages);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load audit logs.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.filterMethod  = '';
    this.filterPath    = '';
    this.filterStatus  = '';
    this.filterAdminId = '';
    this.filterUserId  = '';
    this.filterFrom    = '';
    this.filterTo      = '';
    this.load(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.load(page);
  }

  // ── Helpers ────────────────────────────────────────────────────
  methodClass(method: string): string {
    return METHOD_COLORS[method] ?? 'method--default';
  }

  statusClass(code: number): string {
    if (code < 300) return 'status--ok';
    if (code < 400) return 'status--redirect';
    if (code < 500) return 'status--client-err';
    return 'status--server-err';
  }

  formatTime(ts: string): string {
    return new Date(ts).toLocaleString();
  }

  formatDuration(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  actor(log: AuditLog): string {
    if (log.adminId) return `admin:${log.adminId.slice(-6)}`;
    if (log.userId)  return `user:${log.userId.slice(-6)}`;
    return '-';
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.filterMethod || this.filterPath || this.filterStatus ||
      this.filterAdminId || this.filterUserId || this.filterFrom || this.filterTo
    );
  }

  readonly pageSize = PAGE_SIZE;
}
