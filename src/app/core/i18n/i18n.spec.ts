import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateLocale,
  language,
  languagePreference,
  plural,
  setLanguagePreference,
  t,
  TranslatePipe,
} from './i18n';
import { sv } from './sv';

describe('app language', () => {
  afterEach(() => {
    setLanguagePreference('auto');
    vi.restoreAllMocks();
    window.dispatchEvent(new Event('languagechange'));
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('follows the device until a language is chosen, and remembers the choice', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['sv-SE', 'en']);
    window.dispatchEvent(new Event('languagechange'));
    expect(languagePreference()).toBe('auto');
    expect(language()).toBe('sv');
    expect(document.documentElement.lang).toBe('sv');
    setLanguagePreference('en');
    expect(language()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('recipebook:language:v1')).toBe('en');
  });

  it('falls back to English for other device languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    window.dispatchEvent(new Event('languagechange'));
    expect(language()).toBe('en');
  });

  it('translates with placeholders and plurals, keeping English when Swedish is missing', () => {
    setLanguagePreference('sv');
    expect(t('Add recipe')).toBe(sv['Add recipe']);
    expect(plural(1, '{n} recipe', '{n} recipes')).toBe('1 recept');
    expect(plural(3, '{n} recipe', '{n} recipes')).toBe('3 recept');
    expect(t('Not a key {x}', { x: 2 })).toBe('Not a key 2');
    expect(dateLocale()).toBe('sv-SE');
    setLanguagePreference('en');
    expect(plural(3, '{n} recipe', '{n} recipes')).toBe('3 recipes');
  });

  it('updates templates as soon as the language changes', async () => {
    @Component({ imports: [TranslatePipe], template: `<p>{{ 'Add recipe' | t }}</p>` })
    class Host {}
    setLanguagePreference('en');
    const view = TestBed.createComponent(Host);
    view.autoDetectChanges();
    await view.whenStable();
    expect(view.nativeElement.textContent.trim()).toBe('Add recipe');
    setLanguagePreference('sv');
    await view.whenStable();
    expect(view.nativeElement.textContent.trim()).toBe(sv['Add recipe']);
  });
});
