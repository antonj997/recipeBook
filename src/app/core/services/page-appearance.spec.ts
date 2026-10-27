import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PageAppearanceService } from './page-appearance.service';

describe('page appearance', () => {
  it('temporarily replaces browser chrome without changing the active recipe color', () => {
    const appearance = TestBed.inject(PageAppearanceService);
    const leaveRecipe = appearance.useBackground('#d6e8df');
    const leaveFocus = appearance.useBrowserColor('#faf9f5');
    expect(appearance.background()).toBe('#d6e8df');
    expect(appearance.browserColor()).toBe('#faf9f5');
    leaveFocus();
    expect(appearance.browserColor()).toBeNull();
    expect(appearance.background()).toBe('#d6e8df');
    leaveRecipe();
  });

  it('ignores a stale overlay cleanup after a newer browser color takes ownership', () => {
    const appearance = TestBed.inject(PageAppearanceService);
    const leaveOld = appearance.useBrowserColor('#faf9f5');
    const leaveNew = appearance.useBrowserColor('#ffffff');
    leaveOld();
    expect(appearance.browserColor()).toBe('#ffffff');
    leaveNew();
    expect(appearance.browserColor()).toBeNull();
  });
});
