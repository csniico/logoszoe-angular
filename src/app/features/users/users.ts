import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, CreateUserRole } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { User, UserRole } from '../../core/models/user.model';

type RoleFilter = 'all' | 'admin' | 'user';
type SessionFilter = 'all' | 'active' | 'inactive' | 'expired';

interface CreateForm {
  firstname: string;
  lastname:  string;
  email:     string;
  password:  string;
  role:      CreateUserRole;
}

interface RoleOption {
  value: CreateUserRole;
  label: string;
  description: string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class UsersComponent implements OnInit {
  private readonly userService  = inject(UserService);
  private readonly authService  = inject(AuthService);
  private readonly confirmModal = inject(ConfirmModalService);

  // ── Remote data ──────────────────────────────────────────────
  readonly users          = signal<User[]>([]);
  readonly loading        = signal(true);
  readonly error          = signal<string | null>(null);

  // ── Controls ─────────────────────────────────────────────────
  readonly searchQuery    = signal('');
  readonly filterRole     = signal<RoleFilter>('all');
  readonly filterSession  = signal<SessionFilter>('all');
  readonly updatingRoleId = signal<string | null>(null);

  // ── Current admin role ────────────────────────────────────────
  readonly isSuperAdmin = this.authService.isSuperAdmin;

  /**
   * Role options when creating a user.
   * Backend POST /admin/users only supports 'user' and 'admin'.
   * Superadmin accounts cannot be created through this form.
   */
  readonly roleOptions: RoleOption[] = [
    { value: 'user',  label: 'User',  description: 'Regular app account' },
    { value: 'admin', label: 'Admin', description: 'Admin panel access'  },
  ];

  // ── Create user modal ─────────────────────────────────────────
  readonly showCreate  = signal(false);
  readonly creating    = signal(false);
  readonly createError = signal<string | null>(null);

  createForm: CreateForm = this.blankForm();

  private blankForm(): CreateForm {
    return { firstname: '', lastname: '', email: '', password: '', role: 'user' };
  }

  openCreate(): void {
    this.createForm  = this.blankForm();
    this.createError.set(null);
    this.showCreate.set(true);
  }

  closeCreate(): void {
    if (this.creating()) return;
    this.showCreate.set(false);
  }

  submitCreate(): void {
    const f = this.createForm;
    if (!f.firstname.trim() || !f.lastname.trim() || !f.email.trim() || !f.password.trim()) {
      this.createError.set('All fields are required.');
      return;
    }
    // Guard: non-superadmin cannot assign superadmin
    if (f.role === 'superadmin' && !this.isSuperAdmin()) {
      this.createError.set('Only superadmins can assign the superadmin role.');
      return;
    }

    this.creating.set(true);
    this.createError.set(null);

    const handleError = (err: { error?: { message?: unknown } }) => {
      const msg = err?.error?.message;
      this.createError.set(
        Array.isArray(msg) ? (msg as string[]).join(' · ') :
        typeof msg === 'string' ? msg :
        'Failed to create user. Please try again.',
      );
      this.creating.set(false);
    };

    if (f.role === 'user') {
      // → app users collection
      this.userService.create({
        firstname: f.firstname.trim(),
        lastname:  f.lastname.trim(),
        email:     f.email.trim(),
        password:  f.password,
        role:      'user',
      }).subscribe({
        next: (user) => {
          this.users.update((list) => [user, ...list]);
          this.creating.set(false);
          this.showCreate.set(false);
        },
        error: handleError,
      });
    } else {
      // → admin — POST /admin/users with role:'admin', needs firstname+lastname
      this.userService.create({
        firstname: f.firstname.trim(),
        lastname:  f.lastname.trim(),
        email:     f.email.trim(),
        password:  f.password,
        role:      f.role,
      }).subscribe({
        next: () => {
          this.creating.set(false);
          this.showCreate.set(false);
        },
        error: handleError,
      });
    }
  }

  // ── Filtered + sorted list ────────────────────────────────────
  readonly displayed = computed<User[]>(() => {
    const q       = this.searchQuery().toLowerCase().trim();
    const role    = this.filterRole();
    const session = this.filterSession();

    let list = this.users();

    if (q) {
      list = list.filter((u) =>
        u.firstname.toLowerCase().includes(q) ||
        (u.lastname ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
      );
    }

    if (role !== 'all') {
      list = list.filter((u) => u.role === role);
    }

    if (session !== 'all') {
      list = list.filter((u) => u.session === session);
    }

    return [...list].sort((a, b) =>
      `${a.firstname} ${a.lastname ?? ''}`.localeCompare(`${b.firstname} ${b.lastname ?? ''}`),
    );
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit(): void {
    this.userService.getAll().subscribe({
      next:  (users) => { this.users.set(users); this.loading.set(false); },
      error: ()      => { this.error.set('Failed to load users.'); this.loading.set(false); },
    });
  }

  // ── Role toggle ───────────────────────────────────────────────
  toggleRole(user: User): void {
    if (this.updatingRoleId()) return;
    const newRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    // Non-superadmins cannot promote to admin
    if (newRole === 'admin' && !this.isSuperAdmin()) return;
    this.updatingRoleId.set(user._id);
    this.userService.updateRole(user._id, newRole).subscribe({
      next: (updated) => {
        this.users.update((list) =>
          list.map((u) => (u._id === updated._id ? updated : u)),
        );
        this.updatingRoleId.set(null);
      },
      error: () => { this.updatingRoleId.set(null); },
    });
  }

  // ── Delete ────────────────────────────────────────────────────
  async delete(id: string, name: string): Promise<void> {
    const ok = await this.confirmModal.open({
      intent: `Delete "${name}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.userService.delete(id).subscribe({
      next: () => this.users.update((list) => list.filter((u) => u._id !== id)),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  initials(user: User): string {
    return `${user.firstname[0] ?? ''}${user.lastname?.[0] ?? ''}`.toUpperCase();
  }

  fullName(user: User): string {
    return [user.firstname, user.lastname].filter(Boolean).join(' ');
  }
}
