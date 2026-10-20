import { TimerPushService } from './timer-push.service';
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
  duration: number;
  running: boolean;
  started: boolean;
  done: boolean;
  elapsed: number;
}
interface SavedTimer {
  target: StepTimerTarget;
  remaining: number;
  duration: number;
  deadline?: number;
  started: boolean;
  done: boolean;
  updatedAt: number;
}

const overdueLifetime = 60 * 60_000;
const ringingLifetime = 30_000;

/** One app clock. Timer definitions sync with recipes; countdowns stay on this device. */
@Service()
export class StepTimerService {
  private readonly auth = inject(SupabaseService);
  private readonly push = inject(TimerPushService);
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
  private stored: string | null = null;
  private readonly now = signal(Date.now());
  private ticker?: ReturnType<typeof setInterval>;
  private audio?: AudioContext;
  private alarmTicker?: ReturnType<typeof setInterval>;
  private readonly tones = new Set<OscillatorNode>();

  constructor() {
    this.loadScope();
    effect(() => {
      if (this.push.enabled()) untracked(() => this.syncPush());
    });
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
      this.syncAlarm();
      void this.validateEntries(this.scope(), this.cookbook.revision());
    };
    const storage = (event: StorageEvent) => {
      if (
        (event.storageArea && event.storageArea !== localStorage) ||
        (event.key !== null && event.key !== this.scope())
      )
        return;
      refresh();
    };
    this.document.addEventListener('visibilitychange', refresh);
    this.document.defaultView?.addEventListener('pageshow', refresh);
    this.document.defaultView?.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      this.validationRequest++;
      clearInterval(this.ticker);
      this.document.removeEventListener('visibilitychange', refresh);
      this.document.defaultView?.removeEventListener('pageshow', refresh);
      this.document.defaultView?.removeEventListener('storage', storage);
      this.closeAudio();
    });
  }

  state(target: StepTimerTarget): StepTimerState {
    const saved = this.loadedScope() === this.scope() ? this.entries().get(target.key) : undefined;
    return saved
      ? {
          duration: saved.duration,
          remaining:
            saved.deadline === undefined
              ? saved.remaining
              : Math.max(0, Math.ceil((saved.deadline - this.now()) / 1000)),
          running: saved.deadline !== undefined && !saved.done,
          started: saved.started,
          done: saved.done,
          elapsed:
            saved.done && saved.deadline !== undefined
              ? Math.max(0, Math.floor((this.now() - saved.deadline) / 1000))
              : 0,
        }
      : {
          remaining: target.seconds,
          duration: target.seconds,
          running: false,
          started: false,
          done: false,
          elapsed: 0,
        };
  }
  setDuration(target: StepTimerTarget, seconds: number): void {
    if (!isStepTimerSeconds(seconds)) return;
    this.ensureScope();
    this.changeDuration(target, seconds * 1000, this.entries().get(target.key), Date.now());
  }
  start(target: StepTimerTarget): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    if (saved?.deadline !== undefined && !saved.done) return;
    this.prepareSound();
    const remaining = saved?.done ? target.seconds : saved?.remaining || target.seconds;
    this.put({
      target,
      remaining,
      duration: saved?.done ? target.seconds : (saved?.duration ?? remaining),
      deadline: Date.now() + remaining * 1000,
      started: true,
      done: false,
      updatedAt: Date.now(),
    });
  }
  pause(target: StepTimerTarget): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    if (saved?.deadline === undefined || saved.done) return;
    const remaining = Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000));
    if (remaining === 0) {
      // A delayed Pause still completes against the original deadline and verified step.
      this.tick();
      return;
    }
    this.put({
      ...saved,
      remaining,
      deadline: undefined,
      done: false,
      updatedAt: Date.now(),
    });
  }
  adjust(target: StepTimerTarget, minutes: -1 | 1): void {
    this.ensureScope();
    const saved = this.entries().get(target.key);
    const now = Date.now();
    const milliseconds = saved?.done
      ? 0
      : saved?.deadline === undefined
        ? (saved?.remaining ?? target.seconds) * 1000
        : Math.max(0, saved.deadline - now);
    const adjusted = Math.max(
      1000,
      Math.min(maxStepTimerSeconds * 1000, milliseconds + minutes * 60_000),
    );
    this.changeDuration(target, adjusted, saved, now);
  }
  private changeDuration(
    target: StepTimerTarget,
    milliseconds: number,
    saved: SavedTimer | undefined,
    now: number,
  ): void {
    const expired = saved?.done || (saved?.deadline !== undefined && saved.deadline <= now);
    const currentRemaining =
      saved?.deadline === undefined
        ? (saved?.remaining ?? target.seconds)
        : Math.max(0, Math.ceil((saved.deadline - now) / 1000));
    const passed = saved?.started && !expired ? Math.max(0, saved.duration - currentRemaining) : 0;
    const remaining = Math.ceil(milliseconds / 1000);
    this.put({
      target,
      remaining,
      duration: Math.min(Number.MAX_SAFE_INTEGER, passed + remaining),
      deadline: saved?.deadline !== undefined && !expired ? now + milliseconds : undefined,
      started: saved?.started ?? false,
      done: false,
      updatedAt: now,
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
      const stored = JSON.stringify([...entries.values()]);
      localStorage.setItem(this.loadedScope(), stored);
      this.stored = stored;
    } catch {
      /* In-memory countdowns still survive ordinary page navigation. */
    }
    this.syncClock();
    this.syncPush();
    this.syncAlarm();
  }
  private ensureScope(): void {
    if (this.loadedScope() !== this.scope()) {
      this.loadScope();
      return;
    }
    try {
      if (localStorage.getItem(this.loadedScope()) !== this.stored) this.loadScope();
    } catch {
      // Keep in-memory countdowns usable when storage is unavailable.
    }
  }
  private loadScope(): void {
    if (this.loadedScope() !== this.scope()) this.closeAudio();
    this.validatedRevision = -1;
    this.validationRequest++;
    clearInterval(this.ticker);
    this.ticker = undefined;
    const scope = this.scope();
    const entries = new Map<string, SavedTimer>();
    try {
      this.stored = localStorage.getItem(scope);
      const raw: unknown = JSON.parse(this.stored ?? '[]');
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
    this.syncPush();
    this.syncAlarm();
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
      this.syncPush();
      this.push.retry();
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
      (raw['duration'] !== undefined &&
        (typeof raw['duration'] !== 'number' ||
          !Number.isSafeInteger(raw['duration']) ||
          raw['duration'] <= 0)) ||
      typeof raw['started'] !== 'boolean' ||
      typeof raw['done'] !== 'boolean' ||
      typeof raw['updatedAt'] !== 'number' ||
      !Number.isFinite(raw['updatedAt']) ||
      Date.now() - raw['updatedAt'] > 7 * 86400_000 ||
      (raw['deadline'] !== undefined &&
        (typeof raw['deadline'] !== 'number' ||
          !Number.isFinite(raw['deadline']) ||
          raw['deadline'] > Date.now() + maxStepTimerSeconds * 1000 ||
          raw['deadline'] <= Date.now() - overdueLifetime)) ||
      (raw['done'] === true && raw['deadline'] === undefined)
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
      duration:
        (raw['duration'] as number | undefined) ??
        (raw['started']
          ? Math.max(target['seconds'], raw['remaining'])
          : raw['remaining'] || target['seconds']),
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
    this.removeWhere(
      (saved) => saved.deadline !== undefined && saved.deadline <= Date.now() - overdueLifetime,
    );
    this.syncAlarm();
    if (this.validatedRevision !== this.cookbook.revision()) return;
    const finished = [...this.entries().values()].filter(
      (saved) => !saved.done && saved.deadline !== undefined && saved.deadline <= Date.now(),
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
        remaining: 0,
        done: true,
        updatedAt: Date.now(),
      });
    this.commit(next);
    this.feedback.show(
      finished.length === 1
        ? 'Step ' + (finished[0].target.index + 1) + ' is ready to check'
        : finished.length + ' steps are ready to check',
    );
  }
  private syncPush(): void {
    this.ensureScope();
    this.push.replaceTimers(
      [...this.entries().values()].map(({ target, deadline }) => ({ target, deadline })),
    );
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
  /** Alarm time is bounded by the original deadline, even after browser suspension. */
  private syncAlarm(): void {
    if (!this.shouldRing()) {
      this.stopAlarm();
      return;
    }
    if (this.alarmTicker !== undefined) return;
    this.playChime();
    this.alarmTicker = setInterval(() => {
      if (!this.shouldRing()) this.stopAlarm();
      else this.playChime();
    }, 2000);
  }
  private shouldRing(): boolean {
    return (
      this.document.visibilityState === 'visible' &&
      this.audio?.state === 'running' &&
      [...this.entries().values()].some(
        (saved) =>
          saved.done &&
          saved.deadline !== undefined &&
          Date.now() >= saved.deadline &&
          Date.now() - saved.deadline < ringingLifetime,
      )
    );
  }
  private playChime(): void {
    try {
      this.chime();
    } catch {
      this.stopAlarm();
    }
  }
  private stopAlarm(): void {
    clearInterval(this.alarmTicker);
    this.alarmTicker = undefined;
    for (const tone of this.tones) {
      try {
        tone.stop();
      } catch {
        /* The audio graph may already have ended. */
      }
      tone.disconnect();
    }
    this.tones.clear();
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
      this.tones.add(tone);
      tone.start(at);
      tone.stop(at + 0.25);
      tone.onended = () => {
        this.tones.delete(tone);
        tone.disconnect();
        gain.disconnect();
      };
    }
  }
  private closeAudio(): void {
    this.stopAlarm();
    void this.audio?.close().catch(() => undefined);
    this.audio = undefined;
  }
}
