import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecipeDraftService } from './recipe-draft.service';
import { RecipeService } from './recipe.service';
import { SupabaseService } from './supabase.service';

describe('bounded automatic import photos', () => {
  const version = signal(0);
  const requests: string[] = [];
  let onPhoto: (() => void) | undefined;
  const auth = {
    accountVersion: version,
    cacheScope: 'photo-test',
    user: signal(undefined),
    configured: () => true,
    invokeImporter: async (body: { url: string; action?: 'photo' }) => {
      requests.push(body.url);
      onPhoto?.();
      return new Response('unavailable', { status: 404 });
    },
  };
  const recipes = {
    getCollections: async () => [],
    matchCollections: () => [],
  } as unknown as RecipeService;
  function imported(count = 20) {
    return {
      title: 'Soup',
      ingredients: ['1 tomato'],
      imageUrl: 'https://www.ica.se/hero.jpg',
      instructions: Array.from({ length: count }, (_, i) => 'Step ' + i),
      stepDetails: Array.from({ length: count }, (_, i) => ({
        imageUrl: `https://www.ica.se/step-${i}.jpg`,
      })),
    };
  }
  beforeEach(() => {
    version.set(0);
    requests.length = 0;
    onPhoto = undefined;
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: auth }] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('attempts at most twelve photos including the hero and retains extra step URLs for later', async () => {
    const service = TestBed.inject(RecipeDraftService);
    const draft = await service.fromImport(imported(), recipes);
    expect(requests).toHaveLength(12);
    expect(requests[0]).toBe('https://www.ica.se/hero.jpg');
    expect(requests.at(-1)).toBe('https://www.ica.se/step-10.jpg');
    expect(draft.stepDetails?.[19].imageUrl).toBe('https://www.ica.se/step-19.jpg');
    expect(draft.instructions).toHaveLength(20);
    expect(service.photoNotice()).toContain('Some photos could not be saved offline');
  });

  it('keeps existing offline copies without consuming download attempts', async () => {
    const value = imported(14);
    const data = 'data:image/jpeg;base64,b2ZmbGluZQ==';
    const draft = await TestBed.inject(RecipeDraftService).fromImport(
      {
        ...value,
        imageDataUrl: data,
        stepDetails: value.stepDetails.map((step, i) =>
          i < 2 ? { ...step, imageDataUrl: data } : step,
        ),
      },
      recipes,
    );
    expect(requests).toHaveLength(12);
    expect(requests[0]).toBe('https://www.ica.se/step-2.jpg');
    expect(draft.imageDataUrl).toBe(data);
    expect(draft.stepDetails?.[0].imageDataUrl).toBe(data);
  });

  it('stops downloading and rejects the draft after the account changes', async () => {
    onPhoto = () => version.set(1);
    await expect(
      TestBed.inject(RecipeDraftService).fromImport(imported(), recipes),
    ).rejects.toThrow('Account changed');
    expect(requests).toHaveLength(1);
  });

  it('stops downloading and rejects a cancelled import', async () => {
    const controller = new AbortController();
    onPhoto = () => controller.abort();
    await expect(
      TestBed.inject(RecipeDraftService).fromImport(imported(), recipes, controller.signal),
    ).rejects.toThrow();
    expect(requests).toHaveLength(1);
  });
});
