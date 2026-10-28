import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingGroup } from '../models/shopping-item';
import { BasketService } from './basket.service';
import { ShoppingListService } from './shopping-list.service';

describe('BasketService', () => {
  const groups = signal<Partial<ShoppingGroup>[]>([]);
  let basket: HTMLElement;
  let reduced: boolean;
  let finish: (() => void)[];

  beforeEach(() => {
    groups.set([]);
    reduced = false;
    finish = [];
    basket = document.createElement('a');
    basket.className = 'shopping-link';
    document.body.append(basket);
    vi.spyOn(basket, 'getBoundingClientRect').mockReturnValue({
      left: 300,
      top: 10,
      width: 44,
      height: 44,
    } as DOMRect);
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: vi.fn(() => {
        let done!: () => void;
        const finished = new Promise<void>((resolve) => (done = resolve));
        finish.push(done);
        return { finished, cancel: vi.fn() };
      }),
    });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    TestBed.configureTestingModule({
      providers: [{ provide: ShoppingListService, useValue: { groups } }],
    });
  });
  afterEach(() => {
    basket.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('counts what is still to buy and says so to screen readers', async () => {
    const service = TestBed.inject(BasketService);
    await vi.waitFor(() => expect(service['shopping']()).not.toBeNull());
    expect(service.count()).toBe(0);
    expect(service.label()).toBe('Shopping list');
    groups.set([{ checked: false }, { checked: true }, { checked: false }]);
    expect(service.count()).toBe(2);
    expect(service.label()).toBe('Shopping list, 2 to buy');
  });

  it('flies a few dots from the source into the basket, then bumps it', async () => {
    const service = TestBed.inject(BasketService);
    const flight = service.flyFrom({ left: 20, top: 600, width: 100, height: 40 } as DOMRect, 9);
    const dots = document.querySelectorAll('.basket-dot');
    expect(dots).toHaveLength(6);
    const [keyframes] = vi.mocked(Element.prototype.animate).mock.calls[0]!;
    expect((keyframes as Keyframe[])[0]!['transform']).toBe('translate(70px, 620px)');
    expect((keyframes as Keyframe[]).at(-1)!['transform']).toBe(
      'translate(322px, 32px) scale(0.4)',
    );
    expect(service.arrivals()).toBe(0);
    for (const done of finish) done();
    await flight;
    expect(document.querySelectorAll('.basket-dot')).toHaveLength(0);
    expect(service.arrivals()).toBe(1);
  });

  it('only bumps the basket under Reduce Motion', async () => {
    reduced = true;
    const service = TestBed.inject(BasketService);
    await service.flyFrom({ left: 0, top: 0, width: 10, height: 10 } as DOMRect, 3);
    expect(document.querySelectorAll('.basket-dot')).toHaveLength(0);
    expect(service.arrivals()).toBe(1);
  });
});
