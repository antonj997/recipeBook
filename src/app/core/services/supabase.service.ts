import { Service, signal } from '@angular/core';
import type { SupabaseClient, User } from '@supabase/supabase-js';

@Service()
export class SupabaseService {
  private readonly currentUser = signal<Pick<User, 'id' | 'email'> | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly accountVersion = signal(0);
  readonly cacheScope = new URL('.', document.baseURI).href;
  readonly configured = signal(false);
  client: SupabaseClient | null = null;
  private initialization?: Promise<void>;
  private endpoint = '';
  private key = '';
  private identityKey = '';

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
      this.setUser(session?.user ?? null);
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
    const { data, error } = await this.client.auth.getSession();
    // This identity only selects a device cache. Every server call still requires a verified JWT.
    this.setUser(
      data.session?.user ??
        (error && (!navigator.onLine || error.name === 'AuthRetryableFetchError')
          ? offlineUser
          : null),
    );
  }

  private setUser(user: Pick<User, 'id' | 'email'> | null): void {
    if (this.currentUser()?.id !== user?.id) this.accountVersion.update((value) => value + 1);
    this.currentUser.set(user ? { id: user.id, email: user.email } : null);
  }

  async sendCode(email: string): Promise<void> {
    if (!this.client) throw new Error('Cloud sign-in is not set up yet.');
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: new URL('.', document.baseURI).href },
    });
    if (error) throw new Error(error.message);
  }

  async verifyCode(email: string, token: string): Promise<void> {
    if (!this.client) throw new Error('Cloud sign-in is not set up yet.');
    const { error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    if (this.client) {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error && this.user()) throw new Error(error.message);
    }
    this.setUser(null);
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
