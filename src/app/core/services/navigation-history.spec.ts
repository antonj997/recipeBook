import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { NavigationHistoryService } from './navigation-history.service';

@Component({ template: '' })
class Page {}

describe('navigation history', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('remembers the page before the current one, without query or fragment', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'discover', component: Page },
          { path: 'recipes/:id', component: Page },
        ]),
      ],
    });
    const history = TestBed.inject(NavigationHistoryService);
    const router = TestBed.inject(Router);
    expect(history.previousPath()).toBeNull();
    await router.navigateByUrl('/');
    expect(history.previousPath()).toBeNull();
    await router.navigateByUrl('/discover?q=soup#top');
    expect(history.previousPath()).toBe('/');
    await router.navigateByUrl('/recipes/soup');
    expect(history.previousPath()).toBe('/discover');
    await router.navigateByUrl('/recipes/bread');
    expect(history.previousPath()).toBe('/recipes/soup');
  });
});
