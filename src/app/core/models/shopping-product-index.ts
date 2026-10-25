import type { ShoppingDepartmentId } from './shopping-department';
import type { DepartmentMatch } from './shopping-department-rules';

export function normalizeCatalogName(value: string): string {
  return value
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bounded phrase lookup; work depends on the item's words, not catalogue size. */
export class ShoppingProductIndex {
  private readonly products = new Map<string, ShoppingDepartmentId>();
  constructor(departments: Readonly<Record<string, readonly string[]>>) {
    for (const [department, names] of Object.entries(departments))
      for (const name of names) this.products.set(name, department as ShoppingDepartmentId);
  }
  find(text: string): DepartmentMatch | null {
    const tokens = [...text.matchAll(/\S+/g)];
    for (let start = 0; start < tokens.length; start++) {
      for (let count = Math.min(7, tokens.length - start); count > 0; count--) {
        const index = tokens[start].index;
        const last = tokens[start + count - 1];
        const end = last.index + last[0].length;
        const department = this.products.get(text.slice(index, end));
        if (department) return { department, index, length: end - index };
      }
    }
    return null;
  }
}
