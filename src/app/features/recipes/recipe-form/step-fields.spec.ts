import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl } from '@angular/forms';
import { afterEach, describe, expect, it } from 'vitest';
import { createStepFields, stepMetadata, stepTimerDuration } from './step-fields';
import { readRecipeMetadata } from '../../../core/models/recipe-metadata';
import { RecipeGroupsComponent } from './recipe-groups';

describe('step timer editor settings', () => {
  it('detects timing in existing instructions and follows text edits until overridden', () => {
    const fields = createStepFields();
    expect(stepTimerDuration('Cook for 20 minutes.', fields)).toBe(1200);
    expect(stepTimerDuration('Cook for 30 minutes.', fields)).toBe(1800);
    expect(stepMetadata(fields).timerSeconds).toBeUndefined();
  });
  it('keeps a deliberate removal after serialization and reopening the editor', () => {
    const fields = createStepFields();
    fields.patchValue({ timerMode: 'off', timerMinutes: null });
    const metadata = readRecipeMetadata(
      JSON.parse(JSON.stringify({ stepDetails: [stepMetadata(fields)] })),
      true,
    );
    const restored = createStepFields(metadata.stepDetails?.[0]);
    expect(stepTimerDuration('Bake for 30 minutes.', restored)).toBeUndefined();
    expect(stepMetadata(restored).timerSeconds).toBeNull();
  });
  it('retains manual timing and other step metadata together', () => {
    const fields = createStepFields({
      timerSeconds: 90,
      section: 'Finish',
      imageUrl: 'https://example.com/step.jpg',
    });
    expect(stepTimerDuration('Serve.', fields)).toBe(90);
    fields.controls.timerMinutes.setValue(2);
    expect(stepMetadata(fields)).toMatchObject({
      timerSeconds: 120,
      section: 'Finish',
      imageUrl: 'https://example.com/step.jpg',
    });
  });
  it('opens a legacy long timer at 60 minutes without changing its recipe data', () => {
    const detail = { timerSeconds: 7200, section: 'Slow cooking' };
    const fields = createStepFields(detail);
    expect(fields.controls.timerMinutes.value).toBe(60);
    expect(fields.valid).toBe(true);
    expect(detail.timerSeconds).toBe(7200);
    expect(stepMetadata(fields)).toMatchObject({ timerSeconds: 7200, section: 'Slow cooking' });
    fields.patchValue({ section: 'Finish', imageUrl: 'https://example.com/step.jpg' });
    fields.markAsDirty();
    expect(stepMetadata(fields)).toMatchObject({
      timerSeconds: 7200,
      section: 'Finish',
      imageUrl: 'https://example.com/step.jpg',
    });
  });
  it('saves an explicitly confirmed 60-minute timer in place of the legacy duration', () => {
    const fields = createStepFields({ timerSeconds: 7200 });
    fields.controls.timerMinutes.markAsDirty();
    expect(stepMetadata(fields).timerSeconds).toBe(3600);
  });
  it('saves a changed custom time in place of the legacy duration', () => {
    const fields = createStepFields({ timerSeconds: 7200 });
    fields.controls.timerMinutes.setValue(30);
    expect(stepMetadata(fields).timerSeconds).toBe(1800);
  });
  it('keeps explicit removal authoritative over the legacy duration after serialization', () => {
    const fields = createStepFields({ timerSeconds: 7200 });
    fields.patchValue({ timerMode: 'off', timerMinutes: null });
    const metadata = readRecipeMetadata(
      JSON.parse(JSON.stringify({ stepDetails: [stepMetadata(fields)] })),
      true,
    );
    expect(metadata.stepDetails?.[0].timerSeconds).toBeNull();
    expect(
      stepTimerDuration('Let rise for 2 hours.', createStepFields(metadata.stepDetails?.[0])),
    ).toBeUndefined();
  });
  it('caps the automatic timer shown by the editor without adding a manual override', () => {
    const fields = createStepFields();
    expect(stepTimerDuration('Let rise for 2 hours.', fields)).toBe(3600);
    expect(stepMetadata(fields).timerSeconds).toBeUndefined();
  });
  it.each([null, 0, -1, Infinity, 60.1, 10081])('rejects an invalid custom time: %s', (minutes) => {
    const fields = createStepFields();
    fields.patchValue({ timerMode: 'custom', timerMinutes: minutes });
    expect(fields.invalid).toBe(true);
  });
});

describe('explicit timer editor actions on legacy durations', () => {
  afterEach(() => TestBed.resetTestingModule());

  function editor() {
    const row = new FormControl('Simmer for 2 hours.', { nonNullable: true });
    const fields = createStepFields({ timerSeconds: 7200 });
    TestBed.configureTestingModule({ imports: [RecipeGroupsComponent] });
    const fixture = TestBed.createComponent(RecipeGroupsComponent);
    fixture.componentRef.setInput('items', new FormArray([row]));
    fixture.componentRef.setInput('stepDetails', new FormArray([fields]));
    fixture.componentRef.setInput('kind', 'step');
    fixture.componentInstance.ngOnInit();
    return { component: fixture.componentInstance, fields, row };
  }

  it('treats typing the displayed 60 minutes as an explicit timer change', () => {
    const { component, fields, row } = editor();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '60';
    const event = new Event('input');
    input.dispatchEvent(event);
    component.changeTimer(row, event);
    expect(stepMetadata(fields).timerSeconds).toBe(3600);
  });

  it('adopts the bounded timer when a legacy timer is removed and added again', () => {
    const { component, fields, row } = editor();
    component.removeTimer(row);
    expect(stepMetadata(fields).timerSeconds).toBeNull();
    component.addTimer(row);
    expect(stepMetadata(fields).timerSeconds).toBe(3600);
  });
});
