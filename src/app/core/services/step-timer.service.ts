import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  isStepTimerSeconds,
  recipeStepTimers,
  maxStepTimerSeconds,
  type StepTimerTarget,
} from '../models/step-timer';
import { SupabaseService } from './supabase.service';
import { FeedbackService } from './feedback.service';
import { CloudCookbookService } from './cloud-cookbook.service';
export type { StepTimerTarget } from '../models/step-timer';

export interface StepTimerState {
  remaining: number;
  running: boolean;
  started: boolean;
  done: boolean;
}
interface SavedTimer {
  target: StepTimerTarget;
  remaining: number;
  deadline?: number;
  started: boolean;
  done: boolean;
  updatedAt: number;
}

/** One app clock. Timer definitions sync with recipes; countdowns stay on this device. */
@Service()
export class StepTimerService {
  private readonly auth = inject(SupabaseService);
  private readonly cookbook = inject(CloudCookbookService);
  private validatedRevision = -1;
  private validationRequest = 0;
  private readonly document = inject(DOCUMENT);
  private readonly feedback = inject(FeedbackService);
  private readonly scope = computed(
    () =>
      'recipebook:timers:v1:' +
      JSON.stringify([this.auth.cacheScope, this.auth.user()?.id ?? 'device']),
  );
  private readonly loadedScope = signal('');
  private readonly entries = signal(new Map<string, SavedTimer>());
  private readonly now = signal(Date.now());
  private ticker?: ReturnType<typeof setInterval>;
  private audio?: AudioContext;

  constructor() {
    this.loadScope();
    effect(() => {
      this.auth.accountVersion();
      const scope = this.scope();
      const revision = this.cookbook.revision();
      untracked(() => {
        if (scope !== this.loadedScope()) this.loadScope();
        void this.validateEntries(scope, revision);
      });
    });
    const refresh = () => {
      this.ensureScope();
      this.now.set(Date.now());
      void this.validateEntries(this.scope(), this.cookbook.revision());
    };
    this.document.addEventListener('visibilitychange', refresh);
    this.document.defaultView?.addEventListener('pageshow', refresh);
    inject(DestroyRef).onDestroy(() => {
      this.validationRequest++;
      clearInterval(this.ticker);
      this.document.removeEventListener('visibilitychange', refresh);
      this.document.defaultView?.removeEventListener('pageshow', refresh);
      this.closeAudio();
    });
  }

  state(target: StepTimerTarget): StepTimerState {
    const saved = this.loadedScope() === this.scope() ? this.entries().get(target.key) : undefined;
    return saved
      ? {
          remaining:
            saved.deadline === undefined
              ? saved.remaining
              : Math.max(0, Math.ceil((saved.deadline - this.now()) / 1000)),
          running: saved.deadline !== undefined,
          started: saved.started,
          done: saved.done,
        }
      : { remaining: target.seconds, running: false, started: false, done: false };
  }
  start(target: StepTimerTarget): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    if (saved?.deadline !== undefined) return;
    this.prepareSound();
    const remaining = saved?.remaining || target.seconds;
    this.put({
      target,
      remaining,
      deadline: Date.now() + remaining * 1000,
      started: true,
      done: false,
      updatedAt: Date.now(),
    });
  }
  pause(target: StepTimerTarget): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    if (saved?.deadline === undefined) return;
    const remaining = Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000));
    this.put({
      ...saved,
      remaining,
      deadline: undefined,
      done: remaining === 0,
      updatedAt: Date.now(),
    });
  }
  adjust(target: StepTimerTarget, minutes: -1 | 1): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    const milliseconds =
      saved?.deadline === undefined
        ? (saved?.remaining ?? target.seconds) * 1000
        : saved.deadline - Date.now();
    const adjusted = Math.max(
      1000,
      Math.min(maxStepTimerSeconds * 1000, milliseconds + minutes * 60_000),
    );
    this.put({
      target,
      remaining: Math.ceil(adjusted / 1000),
      deadline: saved?.deadline === undefined ? undefined : Date.now() + adjusted,
      started: saved?.started ?? false,
      done: false,
      updatedAt: Date.now(),
    });
  }
  reset(target: StepTimerTarget): void {
    this.ensureScope();
    const next = new Map(this.entries());
    next.delete(target.key);
    this.commit(next);
  }
  reconcile(recipeId: string, targets: StepTimerTarget[]): void {
    this.ensureScope();
    const keys = new Set(targets.map((target) => target.key));
    this.removeWhere((saved) => saved.target.recipeId === recipeId && !keys.has(saved.target.key));
  }
  removeRecipe(recipeId: string): void {
    this.ensureScope();
    this.removeWhere((saved) => saved.target.recipeId === recipeId);
  }
  private removeWhere(predicate: (timer: SavedTimer) => boolean): void {
    const next = new Map(this.entries());
    for (const [key, saved] of next) if (predicate(saved)) next.delete(key);
    if (next.size !== this.entries().size) this.commit(next);
  }
  private put(saved: SavedTimer): void {
    const next = new Map(this.entries());
    next.set(saved.target.key, saved);
    this.commit(next);
  }
  private commit(entries: Map<string, SavedTimer>): void {
    this.entries.set(entries);
    this.now.set(Date.now());
    try {
      localStorage.setItem(this.loadedScope(), JSON.stringify([...entries.values()]));
    } catch {
      /* In-memory countdowns still survive ordinary page navigation. */
    }
    this.syncClock();
  }
  private ensureScope(): void {
    if (this.loadedScope() !== this.scope()) this.loadScope();
  }
  private loadScope(): void {
    this.closeAudio();
    this.validatedRevision = -1;
    this.validationRequest++;
    clearInterval(this.ticker);
    this.ticker = undefined;
    const scope = this.scope();
    const entries = new Map<string, SavedTimer>();
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(scope) ?? '[]');
      if (Array.isArray(raw) && raw.length <= 500)
        for (const value of raw) {
          const saved = this.readSaved(value);
          if (saved) entries.set(saved.target.key, saved);
        }
    } catch {
      /* Optional cooking state cannot prevent opening a recipe. */
    }
    this.loadedScope.set(scope);
    this.entries.set(entries);
    this.now.set(Date.now());
    this.syncClock();
  }
  /** Only read recipes with active local countdowns; never scan the whole cookbook each tick. */
  private async validateEntries(scope: string, revision: number): Promise<void> {
    const request = ++this.validationRequest;
    const version = this.auth.accountVersion();
    const saved = [...this.entries().values()];
    try {
      const ids = [...new Set(saved.map((timer) => timer.target.recipeId))];
      const recipes = ids.length ? await this.cookbook.database.recipes.bulkGet(ids) : [];
      if (
        request !== this.validationRequest ||
        scope !== this.scope() ||
        version !== this.auth.accountVersion() ||
        revision !== this.cookbook.revision()
      )
        return;
      const valid = new Set(
        recipes.flatMap((recipe) =>
          recipe ? recipeStepTimers(recipe).flatMap((target) => (target ? [target.key] : [])) : [],
        ),
      );
      const obsolete = new Set(
        saved.filter((timer) => !valid.has(timer.target.key)).map((timer) => timer.target.key),
      );
      this.removeWhere((timer) => obsolete.has(timer.target.key));
      this.validatedRevision = revision;
      this.tick(true);
    } catch {
      // Keep countdowns recoverable, but don't announce unverified restored timers.
      // The next visibility event or cookbook revision retries this local read.
    }
  }
  private readSaved(value: unknown): SavedTimer | undefined {
    if (!value || typeof value !== 'object') return;
    const raw = value as Record<string, unknown>;
    const target = raw['target'] as Record<string, unknown> | null;
    if (
      !target ||
      typeof target !== 'object' ||
      typeof target['key'] !== 'string' ||
      target['key'].length > 1000 ||
      typeof target['recipeId'] !== 'string' ||
      target['recipeId'].length > 200 ||
      typeof target['index'] !== 'number' ||
      !Number.isSafeInteger(target['index']) ||
      target['index'] < 0 ||
      !isStepTimerSeconds(target['seconds']) ||
      typeof raw['remaining'] !== 'number' ||
      !Number.isSafeInteger(raw['remaining']) ||
      raw['remaining'] < 0 ||
      raw['remaining'] > maxStepTimerSeconds ||
      typeof raw['started'] !== 'boolean' ||
      typeof raw['done'] !== 'boolean' ||
      typeof raw['updatedAt'] !== 'number' ||
      !Number.isFinite(raw['updatedAt']) ||
      Date.now() - raw['updatedAt'] > 7 * 86400_000 ||
      (raw['deadline'] !== undefined &&
        (typeof raw['deadline'] !== 'number' ||
          !Number.isFinite(raw['deadline']) ||
          raw['deadline'] > Date.now() + maxStepTimerSeconds * 1000))
    )
      return;
    return {
      target: {
        key: target['key'],
        recipeId: target['recipeId'],
        index: target['index'],
        seconds: target['seconds'],
      },
      remaining: raw['remaining'],
      deadline: raw['deadline'] as number | undefined,
      started: raw['started'],
      done: raw['done'],
      updatedAt: raw['updatedAt'],
    };
  }
  private tick(verified = false): void {
    if (this.loadedScope() !== this.scope()) {
      this.loadScope();
      return;
    }
    this.now.set(Date.now());
    if (this.validatedRevision !== this.cookbook.revision()) return;
    const finished = [...this.entries().values()].filter(
      (saved) => saved.deadline !== undefined && saved.deadline <= Date.now(),
    );
    if (!finished.length) return;
    if (!verified) {
      // Validate once at completion too: a partially failed sync may have committed a changed step.
      void this.validateEntries(this.scope(), this.cookbook.revision());
      return;
    }
    const next = new Map(this.entries());
    for (const saved of finished)
      next.set(saved.target.key, {
        ...saved,
        deadline: undefined,
        remaining: 0,
        done: true,
        updatedAt: Date.now(),
      });
    this.commit(next);
    this.feedback.show(
      finished.length === 1
        ? 'Timer finished — step ' + (finished[0].target.index + 1)
        : finished.length + ' timers finished',
    );
    try {
      this.chime();
    } catch {
      // An unavailable audio device must not interrupt the countdown or its visual alert.
    }
  }
  private syncClock(): void {
    const running = [...this.entries().values()].some((saved) => saved.deadline !== undefined);
    if (running && this.ticker === undefined) this.ticker = setInterval(() => this.tick(), 1000);
    if (!running) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }
  private prepareSound(): void {
    try {
      if (typeof AudioContext === 'undefined') return;
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => undefined);
    } catch {
      /* Visual completion remains available when audio is blocked. */
    }
  }
  private chime(): void {
    if (!this.audio || this.audio.state !== 'running') return;
    for (const [offset, frequency] of [
      [0, 660],
      [0.2, 880],
    ]) {
      const tone = this.audio.createOscillator();
      const gain = this.audio.createGain();
      const at = this.audio.currentTime + offset;
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.1, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      tone.connect(gain).connect(this.audio.destination);
      tone.start(at);
      tone.stop(at + 0.25);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
      };
    }
  }
  private closeAudio(): void {
    void this.audio?.close().catch(() => undefined);
    this.audio = undefined;
  }
}
