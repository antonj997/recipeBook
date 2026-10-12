import { inject, Service } from '@angular/core';
import type { Recipe } from '../models/recipe.model';
import { SupabaseService } from './supabase.service';

export type CookingSection = 'ingredients' | 'instructions';
export interface CookingSession {
  section: CookingSection;
  servings?: number;
  completed: { index: number; fingerprint: string }[];
}

export function stepFingerprint(recipe: Recipe, index: number): string {
  // Keep the text itself so even small edits invalidate an old completion.
  return JSON.stringify([recipe.instructions[index], recipe.stepDetails?.[index]?.section ?? '']);
}

@Service()
export class CookingSessionService {
  private auth = inject(SupabaseService);
  private memory = new Map<string, CookingSession>();

  private key(recipeId: string): string {
    return (
      'recipebook:cooking:v1:' +
      JSON.stringify([this.auth.cacheScope, this.auth.user()?.id ?? 'device', recipeId])
    );
  }

  read(recipeId: string): CookingSession | null {
    const key = this.key(recipeId);
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!value || typeof value !== 'object') return this.memory.get(key) ?? null;
      const state = value as Record<string, unknown>;
      if (
        !['ingredients', 'instructions'].includes(String(state['section'])) ||
        !Array.isArray(state['completed'])
      )
        return null;
      return {
        servings:
          typeof state['servings'] === 'number' &&
          Number.isSafeInteger(state['servings']) &&
          state['servings'] > 0
            ? state['servings']
            : undefined,
        section: state['section'] as CookingSection,
        completed: state['completed'].filter(
          (item: unknown): item is CookingSession['completed'][number] => {
            if (!item || typeof item !== 'object') return false;
            const step = item as Record<string, unknown>;
            return (
              typeof step['index'] === 'number' &&
              Number.isSafeInteger(step['index']) &&
              step['index'] >= 0 &&
              typeof step['fingerprint'] === 'string'
            );
          },
        ),
      };
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  save(recipeId: string, session: CookingSession): void {
    const key = this.key(recipeId);
    this.memory.set(key, session);
    try {
      localStorage.setItem(key, JSON.stringify(session));
    } catch {
      // Cooking still works when the browser cannot retain local state.
    }
  }

  clear(recipeId: string): void {
    const key = this.key(recipeId);
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* No saved state to clear. */
    }
  }
}
