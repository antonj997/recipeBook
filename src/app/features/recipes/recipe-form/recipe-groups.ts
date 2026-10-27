import { createStepFields, stepTimerDuration, type StepFields } from './step-fields';
import { Component, ElementRef, inject, input, OnInit, OnDestroy, signal } from '@angular/core';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { CheckboxMarkComponent } from '../../../shared/components/checkbox-mark';
import { AutoGrowTextareaDirective } from '../../../shared/directives/auto-grow-textarea';
import { IconComponent } from '../../../shared/components/icon';
import { animateLayout } from '../../../shared/motion/flip';

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
  imports: [ReactiveFormsModule, IconComponent, CheckboxMarkComponent, AutoGrowTextareaDirective],
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
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  removed = signal<
    {
      control: FormControl<string>;
      groupId: number;
      index: number;
      detail?: StepFields;
    }[]
  >([]);
  private rowIds = new WeakMap<FormControl<string>, number>();
  private nextRowId = 1;
  rowId(control: FormControl<string>): string {
    if (!this.rowIds.has(control)) this.rowIds.set(control, this.nextRowId++);
    return this.kind() + '-text-' + this.rowIds.get(control);
  }
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
    this.endDrag();
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
  add(id: number, after?: FormControl<string>) {
    const control = new FormControl('', {
      nonNullable: true,
    });
    if (this.stepDetails()) this.details.set(control, createStepFields());
    this.groups.update((groups) =>
      groups.map((g) => {
        if (g.id !== id) return g;
        const rows = [...g.rows];
        rows.splice(after ? rows.indexOf(after) + 1 : rows.length, 0, control);
        return { ...g, rows };
      }),
    );
    this.addingTo.set(null);
    this.sync();
    this.message.set(this.kind() + ' added.');
    this.items().markAsDirty();
    this.focusControl(control);
  }
  remove(control: FormControl<string>) {
    const group = this.groups().find((item) => item.rows.includes(control));
    if (!group) return;
    const globalIndex = this.items().controls.indexOf(control);
    this.removed.update((history) => [
      ...history,
      {
        control,
        groupId: group.id,
        index: group.rows.indexOf(control),
        detail: this.details.get(control),
      },
    ]);
    this.groups.update((groups) =>
      groups.map((g) => ({ ...g, rows: g.rows.filter((row) => row !== control) })),
    );
    this.details.delete(control);
    this.sync();
    this.message.set(this.kind() + ' removed. Undo is available.');
    const neighbour = this.items().controls[Math.min(globalIndex, this.items().length - 1)];
    if (neighbour) this.focusControl(neighbour);
    this.items().markAsDirty();
  }
  undoRemove() {
    const removed = this.removed().at(-1);
    if (!removed) return;
    if (removed.detail) this.details.set(removed.control, removed.detail);
    this.groups.update((groups) =>
      groups.map((group) => {
        if (group.id !== removed.groupId) return group;
        const rows = [...group.rows];
        rows.splice(Math.min(removed.index, rows.length), 0, removed.control);
        return { ...group, rows };
      }),
    );
    this.removed.update((history) => history.slice(0, -1));
    this.sync();
    this.message.set(this.kind() + ' restored.');
    this.focusControl(removed.control);
  }
  private focusControl(control: FormControl<string>): void {
    requestAnimationFrame(() => document.getElementById(this.rowId(control))?.focus());
  }
  ingredientEnter(event: KeyboardEvent, control: FormControl<string>, groupId: number): void {
    if (
      event.key !== 'Enter' ||
      event.isComposing ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    this.add(groupId, control);
  }
  pasteRows(event: ClipboardEvent, control: FormControl<string>, groupId: number): void {
    const raw = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n\u2028\u2029]/.test(raw)) return;
    const lines = raw
      .split(/[\r\n\u2028\u2029]+/)
      .map((line) =>
        line
          .trim()
          .replace(/^(?:[•●◦▪▫‣⁃]\s*|[-*+]\s+|(?:\d+|[A-Za-z])[.)]\s+)/, '')
          .replace(/^\[[ xX]\]\s*/, '')
          .trim(),
      )
      .filter(Boolean);
    if (!lines.length) return;
    event.preventDefault();
    const field = event.target as HTMLTextAreaElement;
    lines[0] = control.value.slice(0, field.selectionStart) + lines[0];
    lines[lines.length - 1] += control.value.slice(field.selectionEnd);
    control.setValue(lines[0]);
    control.markAsDirty();
    const extra = lines.slice(1).map((text) => new FormControl(text, { nonNullable: true }));
    if (this.stepDetails()) for (const item of extra) this.details.set(item, createStepFields());
    this.groups.update((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) return group;
        const rows = [...group.rows];
        rows.splice(rows.indexOf(control) + 1, 0, ...extra);
        return { ...group, rows };
      }),
    );
    this.sync();
    this.items().markAsDirty();
    this.message.set(
      lines.length + ' ' + (this.kind() === 'step' ? 'steps' : 'ingredients') + ' pasted.',
    );
    this.focusControl(extra.at(-1) ?? control);
  }
  handleKey(event: KeyboardEvent, control: FormControl<string>): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    this.moveRows(() => this.shift(control, direction));
    requestAnimationFrame(() =>
      document
        .getElementById(this.rowId(control))
        ?.closest('.editor-row')
        ?.querySelector<HTMLButtonElement>('.drag-handle')
        ?.focus(),
    );
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
  hasTimer(control: FormControl<string>): boolean {
    const fields = this.details.get(control);
    return (
      fields?.controls.timerMode.value === 'custom' || !!stepTimerDuration(control.value, fields)
    );
  }
  timerMinutes(control: FormControl<string>): number | null {
    const fields = this.details.get(control);
    if (fields?.controls.timerMode.value === 'custom') return fields.controls.timerMinutes.value;
    const seconds = stepTimerDuration(control.value, fields);
    return seconds ? Math.round((seconds / 60) * 1000) / 1000 : null;
  }
  timerInvalid(control: FormControl<string>): boolean {
    const fields = this.details.get(control);
    return !!fields?.hasError('timer') && (fields.touched || fields.dirty);
  }
  addTimer(control: FormControl<string>): void {
    const fields = this.details.get(control);
    fields?.patchValue({
      timerMode: 'custom',
      timerMinutes: (stepTimerDuration(control.value) ?? 300) / 60,
    });
    fields?.controls.timerMinutes.markAsDirty();
    fields?.markAsDirty();
    requestAnimationFrame(() => document.getElementById(this.rowId(control) + '-timer')?.focus());
  }
  removeTimer(control: FormControl<string>): void {
    const fields = this.details.get(control);
    fields?.patchValue({ timerMode: 'off', timerMinutes: null });
    fields?.markAsDirty();
    requestAnimationFrame(() =>
      document.getElementById(this.rowId(control) + '-timer-add')?.focus(),
    );
  }
  changeTimer(control: FormControl<string>, event: Event): void {
    const input = event.target as HTMLInputElement;
    const fields = this.details.get(control);
    fields?.patchValue({
      timerMode: 'custom',
      timerMinutes: input.value === '' ? null : input.valueAsNumber,
    });
    fields?.controls.timerMinutes.markAsDirty();
    fields?.markAsDirty();
  }
  photo(control: FormControl<string>) {
    const detail = this.details.get(control)?.getRawValue();
    return detail?.imageDataUrl || ''; // Remote previews require an explicit load in the recipe view.
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
    this.items().markAsDirty();
    this.sync();
    this.message.set(this.kind() + ' moved to position ' + this.number(control) + '.');
  }
  /** Rows moved between groups are re-created; they travel instead of fading out and in. */
  readonly moving = signal(false);
  private moveRows(update: () => void): void {
    this.moving.set(true);
    void animateLayout(this.host, update, {
      selector: '.editor-row[data-flip]',
      key: (row) => row.dataset['flip'],
    }).finally(() => this.moving.set(false));
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
  private touchPoint?: { id: number; x: number; y: number; target: HTMLElement };
  private scrollFrame = 0;
  endDrag() {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = 0;
    if (this.touchPoint?.target.hasPointerCapture(this.touchPoint.id))
      this.touchPoint.target.releasePointerCapture(this.touchPoint.id);
    this.touchPoint = undefined;
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
    this.destinationAt(event.clientY, event.currentTarget as HTMLElement);
  }
  private destinationAt(clientY: number, host: HTMLElement): void {
    const elements = Array.from(host.querySelectorAll<HTMLElement>('[data-group-id]'));
    let nearest: HTMLElement | undefined,
      distance = Infinity;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.top - clientY, 0, clientY - r.bottom);
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
      if (clientY < rect.top + rect.height / 2) {
        before = group.rows[i];
        break;
      }
    }
    const current = this.destination();
    if (current?.groupId !== group.id || current?.before !== before)
      this.destination.set({ groupId: group.id, before });
  }
  touchStart(event: PointerEvent, control: FormControl<string>): void {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement,
      row = target.closest<HTMLElement>('.editor-row');
    if (!row) return;
    this.dragging.set(control);
    this.addingTo.set(null);
    this.dragHeight.set(row.offsetHeight);
    this.touchPoint = { id: event.pointerId, x: event.clientX, y: event.clientY, target };
    target.setPointerCapture(event.pointerId);
    this.dragImage = row.cloneNode(true) as HTMLElement;
    this.dragImage.style.cssText =
      'position:fixed;z-index:100;pointer-events:none;opacity:.8;background:var(--color-surface);padding:4px;border-radius:6px;width:' +
      row.offsetWidth +
      'px;left:' +
      row.getBoundingClientRect().left +
      'px;top:0;';
    document.body.appendChild(this.dragImage);
    this.touchMove(event);
  }
  touchMove(event: PointerEvent): void {
    if (!this.touchPoint || event.pointerId !== this.touchPoint.id) return;
    event.preventDefault();
    this.touchPoint.x = event.clientX;
    this.touchPoint.y = event.clientY;
    if (this.dragImage)
      this.dragImage.style.transform = 'translateY(' + (event.clientY - 24) + 'px)';
    this.destinationAt(event.clientY, this.host);
    if (!this.scrollFrame) this.scrollFrame = requestAnimationFrame(() => this.scrollTouch());
  }
  private scrollTouch(): void {
    this.scrollFrame = 0;
    const point = this.touchPoint;
    if (!point) return;
    const delta = point.y < 70 ? -8 : point.y > innerHeight - 90 ? 8 : 0;
    if (delta) {
      window.scrollBy(0, delta);
      this.destinationAt(point.y, this.host);
      this.scrollFrame = requestAnimationFrame(() => this.scrollTouch());
    }
  }
  touchEnd(event: PointerEvent): void {
    if (!this.touchPoint || event.pointerId !== this.touchPoint.id) return;
    event.preventDefault();
    const control = this.dragging(),
      to = this.destination();
    if (control && to) this.moveRows(() => this.move(control, to.groupId, to.before));
    this.endDrag();
  }
  touchCancel(): void {
    if (this.touchPoint) this.endDrag();
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
    this.moveRows(() => this.move(control, to.groupId, to.before));
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
