import { Component, input, OnInit, OnDestroy, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import { IconComponent } from '../../../shared/components/icon';

export type StepFields = FormGroup<{
  section: FormControl<string>;
  imageUrl: FormControl<string>;
  imageDataUrl: FormControl<string>;
}>;
interface Group {
  id: number;
  ungrouped: boolean;
  name: FormControl<string>;
  rows: FormControl<string>[];
}
interface Position {
  groupId: number;
  before: FormControl<string> | null;
}

// Both editors reuse the original text controls. Each instance owns its drag state.
@Component({
  selector: 'app-recipe-groups',
  imports: [ReactiveFormsModule, IconComponent, CheckboxMarkComponent],
  templateUrl: './recipe-groups.html',
  styleUrl: './recipe-groups.scss',
})
export class RecipeGroupsComponent implements OnInit, OnDestroy {
  items = input.required<FormArray<FormControl<string>>>();
  sections = input<FormArray<FormControl<string>>>();
  stepDetails = input<FormArray<StepFields>>();
  kind = input<'ingredient' | 'step'>('ingredient');
  photosBusy = input(false);
  groups = signal<Group[]>([]);
  addingTo = signal<number | null>(null);
  dragging = signal<FormControl<string> | null>(null);
  destination = signal<Position | null>(null);
  message = signal('');
  selected = signal<Set<FormControl<string>>>(new Set());
  dragHeight = signal(52);
  private details = new Map<FormControl<string>, StepFields>();
  private nextId = 1;
  private dragImage?: HTMLElement;

  ngOnInit() {
    const groups: Group[] = [];
    this.items().controls.forEach((control, index) => {
      const detail = this.stepDetails()?.at(index);
      if (detail) this.details.set(control, detail);
      const name = (
        this.sections()?.at(index)?.value ??
        detail?.controls.section.value ??
        ''
      ).trim();
      let group = groups.at(-1);
      if (!group || group.name.value !== name) {
        group = {
          id: this.nextId++,
          ungrouped: !name,
          name: new FormControl(name, { nonNullable: true }),
          rows: [],
        };
        groups.push(group);
      }
      group.rows.push(control);
    });
    if (!groups.some((group) => group.ungrouped))
      groups.push({
        id: 0,
        ungrouped: true,
        name: new FormControl('', { nonNullable: true }),
        rows: [],
      });
    this.groups.set(groups);
    this.sync();
  }
  ngOnDestroy() {
    this.dragImage?.remove();
  }
  createGroup() {
    const id = this.nextId++;
    const group: Group = {
      id,
      ungrouped: false,
      name: new FormControl('Group ' + id, { nonNullable: true }),
      rows: [],
    };
    this.groups.update((groups) =>
      this.kind() === 'ingredient' ? [group, ...groups] : [...groups, group],
    );
    this.message.set('Group created.');
  }
  rename(group: Group) {
    group.name.setValue(group.name.value.trim() || 'Group ' + group.id);
    this.sync();
  }
  updateNames() {
    this.sync();
  }
  removeGroup(id: number) {
    const group = this.groups().find((g) => g.id === id);
    if (!group) return;
    this.groups.update((groups) =>
      groups.map((g) =>
        g.id === id
          ? { ...g, ungrouped: true, name: new FormControl('', { nonNullable: true }) }
          : g,
      ),
    );
    this.addingTo.set(null);
    this.sync();
    this.message.set('Group removed. Its items are now ungrouped.');
  }
  add(id: number) {
    const control = new FormControl('', {
      nonNullable: true,
    });
    if (this.stepDetails())
      this.details.set(
        control,
        new FormGroup({
          section: new FormControl('', { nonNullable: true }),
          imageUrl: new FormControl('', { nonNullable: true }),
          imageDataUrl: new FormControl('', { nonNullable: true }),
        }),
      );
    this.groups.update((groups) =>
      groups.map((g) => (g.id === id ? { ...g, rows: [...g.rows, control] } : g)),
    );
    this.addingTo.set(null);
    this.sync();
    this.message.set(this.kind() + ' added.');
  }
  remove(control: FormControl<string>) {
    this.groups.update((groups) =>
      groups.map((g) => ({ ...g, rows: g.rows.filter((row) => row !== control) })),
    );
    this.details.delete(control);
    this.sync();
  }
  pruneEmpty() {
    this.groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        rows: group.rows.filter((control) => {
          if (control.value.trim()) return true;
          this.details.delete(control);
          return false;
        }),
      })),
    );
    this.sync();
  }
  openMenu(id: number) {
    this.selected.set(new Set());
    this.addingTo.set(this.addingTo() === id ? null : id);
  }
  select(control: FormControl<string>) {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(control)) next.delete(control);
      else next.add(control);
      return next;
    });
  }
  moveSelected(id: number) {
    // Candidate order preserves the original recipe order regardless of click order.
    const controls = this.candidates(id).filter((item) => this.selected().has(item.control));
    for (const { control } of controls) this.move(control, id);
    this.selected.set(new Set());
    this.message.set(controls.length + ' items moved.');
  }
  candidates(id: number) {
    return this.groups()
      .filter((g) => g.id !== id)
      .flatMap((g) => g.rows.map((control) => ({ control, group: g.name.value || 'Ungrouped' })));
  }
  number(control: FormControl<string>) {
    return this.items().controls.indexOf(control) + 1;
  }
  photo(control: FormControl<string>) {
    const detail = this.details.get(control)?.getRawValue();
    return detail?.imageDataUrl || detail?.imageUrl || '';
  }
  removePhoto(control: FormControl<string>) {
    this.details.get(control)?.patchValue({ imageDataUrl: '', imageUrl: '' });
  }
  move(control: FormControl<string>, id: number, before: FormControl<string> | null = null) {
    if (control === before) return;
    this.groups.update((groups) =>
      groups.map((g) => {
        const rows = g.rows.filter((row) => row !== control);
        if (g.id === id) {
          const index = before ? rows.indexOf(before) : rows.length;
          rows.splice(index < 0 ? rows.length : index, 0, control);
        }
        return { ...g, rows };
      }),
    );
    this.addingTo.set(null);
    this.sync();
    this.message.set(this.kind() + ' moved to position ' + this.number(control) + '.');
  }
  shift(control: FormControl<string>, direction: number) {
    const rows = this.items().controls,
      index = rows.indexOf(control),
      neighbour = rows[index + direction];
    if (!neighbour) return;
    const group = this.groups().find((g) => g.rows.includes(neighbour));
    if (!group) return;
    const before =
      direction < 0 ? neighbour : (group.rows[group.rows.indexOf(neighbour) + 1] ?? null);
    this.move(control, group.id, before);
  }
  startDrag(event: DragEvent, control: FormControl<string>) {
    this.dragging.set(control);
    this.addingTo.set(null);
    const row = (event.target as HTMLElement).closest<HTMLElement>('.editor-row');
    this.dragHeight.set(row?.offsetHeight ?? 52);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-recipebook-row', this.kind());
      if (row) {
        this.dragImage = row.cloneNode(true) as HTMLElement;
        this.dragImage.style.cssText = `position:fixed;left:-10000px;top:0;width:${row.offsetWidth}px;opacity:.7;background:var(--color-surface);padding:8px;`;
        document.body.appendChild(this.dragImage);
        event.dataTransfer.setDragImage(this.dragImage, 24, 24);
      }
    }
  }
  endDrag() {
    this.dragging.set(null);
    this.destination.set(null);
    this.dragImage?.remove();
    this.dragImage = undefined;
  }
  dragOver(event: DragEvent) {
    if (!this.dragging()) {
      if (event.dataTransfer?.types.includes('application/x-recipebook-row')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
      }
      return; // Block native text insertion from another editor too.
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const host = event.currentTarget as HTMLElement;
    const elements = Array.from(host.querySelectorAll<HTMLElement>('[data-group-id]'));
    let nearest: HTMLElement | undefined,
      distance = Infinity;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.top - event.clientY, 0, event.clientY - r.bottom);
      if (d < distance) {
        distance = d;
        nearest = el;
      }
    }
    if (!nearest) return;
    const group = this.groups().find((g) => g.id === Number(nearest!.dataset['groupId']));
    if (!group) return;
    const rows = Array.from(nearest.querySelectorAll<HTMLElement>('.editor-row'));
    let before: FormControl<string> | null = null;
    for (let i = 0; i < rows.length; i++) {
      if (group.rows[i] === this.dragging()) continue;
      const rect = rows[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        before = group.rows[i];
        break;
      }
    }
    const current = this.destination();
    if (current?.groupId !== group.id || current?.before !== before)
      this.destination.set({ groupId: group.id, before });
  }
  dragLeave(event: DragEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      this.destination.set(null);
  }
  drop(event: DragEvent) {
    const control = this.dragging();
    if (!control) {
      if (event.dataTransfer?.types.includes('application/x-recipebook-row')) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    // Resolve the final pointer position as well as the hover preview.
    this.dragOver(event);
    const to = this.destination();
    if (!to) return;
    event.preventDefault();
    event.stopPropagation();
    this.move(control, to.groupId, to.before);
    this.endDrag();
  }
  isSlot(group: Group, before: FormControl<string> | null) {
    return this.destination()?.groupId === group.id && this.destination()?.before === before;
  }
  private sync() {
    const items = this.items(),
      sections = this.sections(),
      details = this.stepDetails();
    items.clear({ emitEvent: false });
    sections?.clear({ emitEvent: false });
    details?.clear({ emitEvent: false });
    for (const group of this.groups())
      for (const control of group.rows) {
        items.push(control, { emitEvent: false });
        sections?.push(new FormControl(group.name.value.trim(), { nonNullable: true }), {
          emitEvent: false,
        });
        const detail = this.details.get(control);
        if (detail) {
          detail.controls.section.setValue(group.name.value.trim(), { emitEvent: false });
          details?.push(detail, { emitEvent: false });
        }
      }
    items.updateValueAndValidity();
    sections?.updateValueAndValidity();
    details?.updateValueAndValidity();
  }
}
