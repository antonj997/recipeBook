import { Pipe, computed, signal, type PipeTransform } from '@angular/core';
import { sv } from './sv';

// The app speaks English or Swedish. English text is the key; `sv` holds the Swedish wording,
// chosen for what reads best rather than word for word. A missing entry falls back to English.
export type Language = 'en' | 'sv';
export type LanguagePreference = 'auto' | Language;
export type TextParams = Record<string, string | number>;

const storageKey = 'recipebook:language:v1';
const preference = signal<LanguagePreference>(readPreference());
const device = signal<Language>(deviceLanguage());

/** The choice in Settings: follow the device, or a fixed language. */
export const languagePreference = preference.asReadonly();
/** The language the app shows now. */
export const language = computed<Language>(() => {
  const chosen = preference();
  return chosen === 'auto' ? device() : chosen;
});

if (typeof window !== 'undefined')
  window.addEventListener('languagechange', () => {
    device.set(deviceLanguage());
    applyDocumentLanguage();
  });

/** Translates English UI text; `{name}` placeholders are filled from `params`. */
export function t(text: string, params?: TextParams): string {
  const wording = language() === 'sv' ? (sv[text] ?? text) : text;
  if (!params) return wording;
  return wording.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** Marks English text for translation where it is stored and translated later with t(). */
export function msg(text: string): string {
  return text;
}

/** Picks the singular or plural English text by count, then translates it with `{n}` filled in. */
export function plural(count: number, one: string, other: string, params?: TextParams): string {
  return t(count === 1 ? one : other, { n: count, ...params });
}

/** The locale for dates and numbers in the current language. */
export function dateLocale(): string {
  return language() === 'sv' ? 'sv-SE' : 'en';
}

export function setLanguagePreference(next: LanguagePreference): void {
  try {
    if (next === 'auto') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, next);
  } catch {
    // The choice still applies until the page reloads.
  }
  preference.set(next);
  applyDocumentLanguage();
}

/** Keeps `<html lang>` in step, so screen readers and hyphenation use the right language. */
export function applyDocumentLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = language();
}

/** `{{ 'Add recipe' | t }}`; impure so a language change re-renders without a reload. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  transform(text: string, params?: TextParams): string {
    return t(text, params);
  }
}

/** `{{ count | plural: '{n} recipe' : '{n} recipes' }}` */
@Pipe({ name: 'plural', pure: false })
export class PluralPipe implements PipeTransform {
  transform(count: number, one: string, other: string, params?: TextParams): string {
    return plural(count, one, other, params);
  }
}

function readPreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === 'en' || stored === 'sv' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function deviceLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of languages) {
    if (/^sv\b/i.test(tag ?? '')) return 'sv';
    if (/^en\b/i.test(tag ?? '')) return 'en';
  }
  return 'en';
}
