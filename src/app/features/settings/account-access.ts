import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';

type AccessMode = 'signin' | 'signup' | 'forgot';

@Component({
  selector: 'app-account-access',
  imports: [ReactiveFormsModule],
  templateUrl: './account-access.html',
  styleUrl: './account-access.scss',
})
export class AccountAccessComponent {
  readonly auth = inject(SupabaseService);
  readonly blocked = input(false);
  readonly busy = this.auth.busy;
  readonly mode = signal<AccessMode>('signin');
  readonly newPassword = computed(() => this.auth.passwordRecovery() || this.mode() === 'signup');
  readonly error = signal('');
  readonly message = signal('');
  readonly showPassword = signal(false);
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    confirm: new FormControl('', { nonNullable: true }),
  });
  private active = true;

  constructor() {
    let version = this.auth.accountVersion();
    effect(() => {
      const next = this.auth.accountVersion();
      if (next !== version) {
        version = next;
        this.clearPasswords();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
      this.clearPasswords();
    });
  }

  changeMode(mode: AccessMode): void {
    if (this.busy()) return;
    this.mode.set(mode);
    this.clearPasswords();
    this.error.set('');
    this.message.set('');
    this.auth.callbackError.set('');
  }

  private clearPasswords(): void {
    this.form.controls.password.reset('');
    this.form.controls.confirm.reset('');
    this.showPassword.set(false);
  }

  async submit(): Promise<void> {
    if (this.busy() || this.blocked()) return;
    const recovery = this.auth.passwordRecovery();
    const mode = this.mode();
    const { email, password, confirm } = this.form.getRawValue();
    this.error.set('');
    this.message.set('');
    this.auth.callbackError.set('');
    this.form.markAllAsTouched();
    if (!recovery && this.form.controls.email.invalid) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if ((recovery || mode !== 'forgot') && !password) {
      this.error.set('Enter your password.');
      return;
    }
    if (this.newPassword() && password !== confirm) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      if (recovery) {
        await this.auth.resetPassword(password);
      } else if (mode === 'signup') {
        const signedIn = await this.auth.createAccount(email.trim(), password);
        if (this.active && !signedIn) {
          this.mode.set('signin');
          this.message.set(
            'Check your email to confirm your account, then sign in with your password. If you already have an account, sign in or reset your password.',
          );
        }
      } else if (mode === 'forgot') {
        await this.auth.sendPasswordReset(email.trim());
        if (this.active)
          this.message.set(
            'If this address has an account, a password reset link will arrive by email. Check your spam folder too.',
          );
      } else {
        await this.auth.signIn(email.trim(), password);
      }
    } catch (error) {
      if (this.active)
        this.error.set(
          error instanceof Error ? error.message : 'Could not complete this account request.',
        );
    } finally {
      // Never retain a password in app storage, feedback, or a hidden form.
      this.clearPasswords();
      this.busy.set(false);
    }
  }
}
