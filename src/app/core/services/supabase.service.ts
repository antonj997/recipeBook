import { Service, signal } from '@angular/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';

@Service()
export class SupabaseService {
  private readonly currentUser = signal<Pick<User, 'id' | 'email'> | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly accountVersion = signal(0);
  readonly cacheScope = new URL('.', document.baseURI).href;
  readonly configured = signal(false);
  readonly busy = signal(false);
  readonly passwordRecovery = signal(false);
  readonly callbackError = signal('');
  readonly callbackNotice = signal('');
  client: SupabaseClient | null = null;
  private initialization?: Promise<void>;
  private endpoint = '';
  private key = '';
  private identityKey = '';
  private recoveryKey = '';

  initialize(): Promise<void> {
    if (this.client) return Promise.resolve();
    return (this.initialization ??= this.load().finally(() => {
      this.initialization = undefined;
    }));
  }

  private async load(): Promise<void> {
    const response = await fetch(new URL('supabase-config.json', document.baseURI), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    let config: unknown = response?.ok ? await response.json().catch(() => null) : null;
    const configKey = 'recipebook:backend-config:' + this.cacheScope;
    if (!response || [502, 503, 504].includes(response.status)) {
      try {
        config = JSON.parse(localStorage.getItem(configKey) ?? 'null');
      } catch {
        /* A first-time offline visitor can still use the device cookbook. */
      }
    }
    if (!config || typeof config !== 'object') return;
    const { url, publishableKey } = config as Record<string, unknown>;
    if (typeof url !== 'string' || typeof publishableKey !== 'string' || !url || !publishableKey)
      return;
    if (
      !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ||
      !publishableKey.startsWith('sb_publishable_')
    )
      return;
    this.configured.set(true);
    this.endpoint = url + '/functions/v1/import-recipe';
    this.key = publishableKey;
    this.identityKey = 'recipebook:last-account:' + new URL(url).hostname;
    this.recoveryKey = 'recipebook:password-recovery:' + this.cacheScope;
    let offlineUser: Pick<User, 'id' | 'email'> | null = null;
    try {
      localStorage.setItem(configKey, JSON.stringify({ url, publishableKey }));
      const saved: unknown = JSON.parse(localStorage.getItem(this.identityKey) ?? 'null');
      if (saved && typeof saved === 'object') {
        const record = saved as Record<string, unknown>;
        if (typeof record['id'] === 'string' && typeof record['email'] === 'string')
          offlineUser = { id: record['id'], email: record['email'] };
      }
    } catch {
      /* Cloud access does not depend on caching public configuration. */
    }
    const sdk = await import('@supabase/supabase-js').catch(() => null);
    if (!sdk) {
      this.setUser(offlineUser);
      return;
    }
    const { createClient } = sdk;
    const callback = new URLSearchParams(location.hash.slice(1));
    const recoveryCallback = callback.get('type') === 'recovery';
    const authCallback = callback.has('access_token') || callback.has('error');
    this.client = createClient(url, publishableKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      global: {
        fetch: (input, options) =>
          fetch(input, {
            ...options,
            signal: options?.signal
              ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
              : AbortSignal.timeout(15_000),
          }),
      },
    });
    this.client.auth.onAuthStateChange((event, session) => {
      // A transient offline refresh must not switch the account's saved cookbook.
      this.setUser(
        session?.user ?? (event === 'INITIAL_SESSION' && !navigator.onLine ? offlineUser : null),
      );
      if (event === 'PASSWORD_RECOVERY') this.setRecovery(session?.user.id ?? null);
      if (event === 'SIGNED_OUT') this.setRecovery(null);
      try {
        if (session)
          localStorage.setItem(
            this.identityKey,
            JSON.stringify({ id: session.user.id, email: session.user.email }),
          );
        else if (event === 'SIGNED_OUT') localStorage.removeItem(this.identityKey);
      } catch {
        /* Cloud sign-in still works without an offline identity copy. */
      }
    });
    const initialized = await this.client.auth.initialize();
    if (initialized.error && authCallback) {
      this.callbackError.set('This email link has expired or was already used. Request a new one.');
      // Never leave an unsuccessful authentication callback in browser history.
      history.replaceState(null, '', new URL('.', document.baseURI).href);
    }
    const { data, error } = await this.client.auth.getSession();
    // This identity only selects a device cache. Every server call still requires a verified JWT.
    this.setUser(
      data.session?.user ??
        (error && (!navigator.onLine || error.name === 'AuthRetryableFetchError')
          ? offlineUser
          : null),
    );
    if (!initialized.error && data.session) {
      let savedRecovery = false;
      try {
        savedRecovery = sessionStorage.getItem(this.recoveryKey) === data.session.user.id;
      } catch {
        /* Recovery still works without a reload. */
      }
      if (recoveryCallback || savedRecovery) this.setRecovery(data.session.user.id);
      else if (authCallback) this.callbackNotice.set('Email verified. You are signed in.');
    }
  }

  private setRecovery(userId: string | null): void {
    this.passwordRecovery.set(!!userId);
    try {
      if (userId) sessionStorage.setItem(this.recoveryKey, userId);
      else sessionStorage.removeItem(this.recoveryKey);
    } catch {
      /* This flag only selects the password form; it grants no access. */
    }
  }

  private setUser(user: Pick<User, 'id' | 'email'> | null): void {
    if (this.currentUser()?.id !== user?.id) {
      // Initial hydration must preserve this tab's recovery form across a reload.
      if (this.currentUser() || !user) this.setRecovery(null);
      this.accountVersion.update((value) => value + 1);
    }
    this.currentUser.set(user ? { id: user.id, email: user.email } : null);
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Cloud sign-in is not set up yet.');
    if (!navigator.onLine)
      throw new Error(
        'Connect to the internet to manage your account. Your recipes stay on this device.',
      );
    return this.client;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error) throw accountError(error);
    this.setRecovery(null);
    this.callbackNotice.set('');
  }

  async createAccount(email: string, password: string): Promise<boolean> {
    validateNewPassword(password);
    const { data, error } = await this.requireClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: new URL('.', document.baseURI).href },
    });
    if (error) throw accountError(error);
    return !!data.session;
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: new URL('.', document.baseURI).href,
    });
    if (error) throw accountError(error);
  }

  async resetPassword(password: string): Promise<void> {
    if (!this.passwordRecovery() || !this.user())
      throw new Error('Open a fresh password reset link from your email first.');
    validateNewPassword(password);
    const { error } = await this.requireClient().auth.updateUser({ password });
    if (error) throw accountError(error);
    this.setRecovery(null);
    this.callbackNotice.set('Password saved.');
  }

  cancelPasswordReset(): void {
    this.setRecovery(null);
  }

  async signOut(): Promise<void> {
    if (this.client) {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error && this.user()) throw new Error(error.message);
    }
    this.setUser(null);
    this.setRecovery(null);
    this.callbackNotice.set('');
    try {
      localStorage.removeItem(this.identityKey);
    } catch {
      /* In-memory sign-out still succeeds. */
    }
  }

  async invokeImporter(
    body: { url: string; action?: 'photo' },
    signal?: AbortSignal,
  ): Promise<Response> {
    const version = this.accountVersion();
    const session = await this.client?.auth.getSession();
    if (version !== this.accountVersion())
      throw new Error('Account changed. Import the recipe again.');
    const token = session?.data.session?.access_token;
    if (!token) throw new Error('Sign in to import recipe links.');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.key,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error ?? 'Could not import the recipe.');
    }
    return response;
  }
}

export function validateNewPassword(password: string): void {
  if (Array.from(password).length < 8) throw new Error('Use at least 8 characters.');
}

function accountError(error: { code?: string; message: string; status?: number }): Error {
  switch (error.code) {
    case 'invalid_credentials':
      return new Error('Email or password is incorrect. Try again, or reset your password.');
    case 'email_not_confirmed':
      return new Error('Confirm your email before signing in. Check your inbox and spam folder.');
    case 'over_email_send_rate_limit':
      return new Error(
        'Too many emails were requested. Please wait before trying again. Password sign-in does not need an email.',
      );
    case 'email_address_not_authorized':
      return new Error(
        'Email delivery is not available for this address yet. The app owner needs to configure an email sender.',
      );
    case 'signup_disabled':
      return new Error('New accounts are not available right now.');
    case 'weak_password':
      return new Error('The password was not accepted. Use at least 8 characters.');
    case 'same_password':
      return new Error('Choose a different password from your current one.');
    case 'reauthentication_needed':
      return new Error('Request and open a fresh password reset email, then try again.');
    default:
      return new Error(
        error.status === 429
          ? 'Too many attempts. Please wait before trying again.'
          : 'Could not complete this account request. Check your connection and try again.',
      );
  }
}
