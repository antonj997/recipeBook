import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharingService } from '../../core/services/sharing.service';
import { UsernameFieldComponent, type UsernameStatus } from './username-field';

@Component({
  imports: [UsernameFieldComponent],
  template: `<app-username-field [(value)]="value" (status)="status.set($event)" />`,
})
class Host {
  value = signal('');
  status = signal<UsernameStatus>('empty');
}

describe('username field', () => {
  const taken = new Set(['anna']);
  const isUsernameAvailable = vi.fn(async (name: string) => !taken.has(name));
  beforeEach(() => {
    vi.useFakeTimers();
    isUsernameAvailable.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: SharingService, useValue: { isUsernameAvailable } }],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function render() {
    const view = TestBed.createComponent(Host);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      view.detectChanges();
    };
    const status = () => root.querySelector('[role=status]')?.textContent?.trim();
    return { view, input, type, status };
  }

  it('explains the rule without asking the server', async () => {
    const { view, type, status } = render();
    type('a!');
    await vi.advanceTimersByTimeAsync(400);
    view.detectChanges();
    expect(status()).toBe('Use 3–24 letters a–z, numbers, dots or underscores.');
    expect(view.componentInstance.status()).toBe('invalid');
    expect(isUsernameAvailable).not.toHaveBeenCalled();
  });

  it('checks a valid name 300 ms after the last keystroke', async () => {
    const { view, type, status, input } = render();
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    type('@Bob');
    await vi.advanceTimersByTimeAsync(299);
    expect(isUsernameAvailable).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    view.detectChanges();
    expect(isUsernameAvailable).toHaveBeenCalledWith('bob');
    expect(status()).toBe('Available');
    expect(view.componentInstance.value()).toBe('@Bob');
    type('anna');
    await vi.advanceTimersByTimeAsync(300);
    view.detectChanges();
    expect(status()).toBe('Taken');
    expect(view.componentInstance.status()).toBe('taken');
  });

  it('checks only the last of quick changes', async () => {
    const { view, type, status } = render();
    type('anna');
    await vi.advanceTimersByTimeAsync(100);
    type('annabel');
    await vi.advanceTimersByTimeAsync(300);
    view.detectChanges();
    expect(isUsernameAvailable).toHaveBeenCalledTimes(1);
    expect(isUsernameAvailable).toHaveBeenCalledWith('annabel');
    expect(status()).toBe('Available');
  });

  it('treats an empty field as no name', async () => {
    const { view, type } = render();
    type('bob');
    type('  ');
    await vi.advanceTimersByTimeAsync(400);
    expect(view.componentInstance.status()).toBe('empty');
    expect(isUsernameAvailable).not.toHaveBeenCalled();
  });
});
