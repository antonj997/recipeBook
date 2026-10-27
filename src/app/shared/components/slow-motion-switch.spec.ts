import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { setSlowMotion, slowMotion } from '../../core/motion';
import { SlowMotionSwitchComponent } from './slow-motion-switch';

describe('Slow motion (test) switch', () => {
  afterEach(() => {
    setSlowMotion(false);
    TestBed.resetTestingModule();
  });

  it('stretches animations on this device until it is switched off', () => {
    const view = TestBed.createComponent(SlowMotionSwitchComponent);
    view.detectChanges();
    const button = (view.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('false');
    button.click();
    view.detectChanges();
    expect(slowMotion()).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    button.click();
    view.detectChanges();
    expect(slowMotion()).toBe(false);
  });
});
