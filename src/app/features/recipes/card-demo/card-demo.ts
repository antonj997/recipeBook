import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecipeService } from '../../../core/services/recipe.service';
import type { Recipe } from '../../../core/models/recipe.model';
import { IconComponent } from '../../../shared/components/icon';
import { CardDemoRailComponent, type DemoBackdrop } from './demo-rail';

const examples: Recipe[] = [
  {
    id: 'demo-pasta',
    title: 'Pasta with roasted tomatoes',
    servings: 2,
    totalTime: 35,
    ingredients: [],
    instructions: [],
  },
  {
    id: 'demo-soup',
    title: 'Creamy mushroom soup',
    servings: 4,
    totalTime: 40,
    ingredients: [],
    instructions: [],
  },
  {
    id: 'demo-roast',
    title: 'Roast chicken & potatoes',
    servings: 4,
    totalTime: 75,
    ingredients: [],
    instructions: [],
  },
  {
    id: 'demo-toast',
    title: 'Tomato & ricotta toast',
    servings: 2,
    totalTime: 20,
    ingredients: [],
    instructions: [],
  },
  {
    id: 'demo-bake',
    title: 'Apple crumble',
    servings: 6,
    totalTime: 45,
    ingredients: [],
    instructions: [],
  },
];

@Component({
  selector: 'app-card-demo',
  imports: [RouterLink, IconComponent, CardDemoRailComponent],
  templateUrl: './card-demo.html',
  styleUrl: './card-demo.scss',
})
export class CardDemoComponent implements OnInit {
  private service = inject(RecipeService);
  mode = signal<'color' | 'glass' | 'compare'>('color');
  phone = signal(false);
  strength = signal(42);
  graphic = signal(true);
  backdrop = signal<DemoBackdrop>('mist');
  backdrops: { id: DemoBackdrop; label: string }[] = [
    { id: 'mist', label: 'Soft wash' },
    { id: 'ribbons', label: 'Clay ribbons' },
    { id: 'discs', label: 'Blue & lavender' },
    { id: 'lines', label: 'Linework' },
    { id: 'paper', label: 'Lined paper' },
  ];
  saved = signal<Recipe[]>([]);
  loading = signal(true);
  usingExamples = computed(() => this.saved().length < 5);
  recipes = computed(() => [
    ...this.saved(),
    ...examples.slice(0, Math.max(0, 5 - this.saved().length)),
  ]);
  async ngOnInit() {
    try {
      this.saved.set((await this.service.getRecipes()).slice(0, 8));
    } catch {
      /* Preview remains usable with illustrative recipes when storage is unavailable. */
    } finally {
      this.loading.set(false);
    }
  }
  changeStrength(event: Event) {
    this.strength.set(Number((event.target as HTMLInputElement).value));
  }
}
