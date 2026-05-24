import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  readonly saved = signal(false);

  readonly form = this.fb.nonNullable.group({
    name:  [this.authService.currentAdmin()?.name  ?? '', Validators.required],
    email: [{ value: this.authService.currentAdmin()?.email ?? '', disabled: true }],
  });

  onSave(): void {
    if (this.form.invalid) return;
    // Hook up to PATCH /admin/users/:id later
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2500);
  }
}
