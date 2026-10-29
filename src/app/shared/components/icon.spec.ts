import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { IconComponent } from './icon';

describe('icon set', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each(['more', 'play', 'pause', 'download', 'upload', 'write', 'reset', 'search', 'trash'])(
    'draws %s',
    (name) => {
      const view = TestBed.createComponent(IconComponent);
      view.componentRef.setInput('name', name);
      view.detectChanges();
      const svg = (view.nativeElement as HTMLElement).querySelector('svg')!;
      expect(svg.querySelectorAll('path, circle, rect').length).toBeGreaterThan(0);
    },
  );
});
