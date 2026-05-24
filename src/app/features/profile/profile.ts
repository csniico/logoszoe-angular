import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent {
  readonly authService = inject(AuthService);

  // ── Profile form ───────────────────────────────────────────────
  name = this.authService.currentAdmin()?.name ?? '';

  readonly saving      = signal(false);
  readonly saveError   = signal<string | null>(null);
  readonly saveSuccess = signal(false);

  readonly nameChanged = computed(() =>
    this.name.trim() !== (this.authService.currentAdmin()?.name ?? ''),
  );

  onSave(): void {
    const trimmed = this.name.trim();
    if (!trimmed) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);

    this.authService.updateProfile(trimmed).subscribe({
      next: () => {
        this.saving.set(false);
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err: { error?: { message?: string } }) => {
        this.saveError.set(err?.error?.message ?? 'Failed to save changes. Please try again.');
        this.saving.set(false);
      },
    });
  }

  // ── Change password ────────────────────────────────────────────
  showPasswordForm = false;
  currentPassword  = '';
  newPassword      = '';
  confirmPassword  = '';

  readonly changingPassword  = signal(false);
  readonly passwordError     = signal<string | null>(null);
  readonly passwordSuccess   = signal(false);

  togglePasswordForm(): void {
    this.showPasswordForm = !this.showPasswordForm;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError.set(null);
    this.passwordSuccess.set(false);
  }

  onChangePassword(): void {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.passwordError.set('All password fields are required.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }

    this.changingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(false);

    this.authService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.passwordSuccess.set(true);
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        setTimeout(() => {
          this.passwordSuccess.set(false);
          this.showPasswordForm = false;
        }, 3000);
      },
      error: (err: { error?: { message?: string } }) => {
        this.passwordError.set(err?.error?.message ?? 'Failed to change password. Please try again.');
        this.changingPassword.set(false);
      },
    });
  }

  // ── Avatar ─────────────────────────────────────────────────────
  get initials(): string {
    const name = this.authService.currentAdmin()?.name ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  get roleLabel(): string {
    const role = this.authService.currentAdmin()?.role;
    if (role === 'superadmin') return 'Superadmin';
    if (role === 'admin') return 'Admin';
    return role ?? '';
  }
}
