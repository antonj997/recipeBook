import { describe, expect, it } from 'vitest';
import { createStepFields, stepMetadata, stepTimerDuration } from './step-fields';
import { readRecipeMetadata } from '../../../core/models/recipe-metadata';

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
  it.each([null, 0, -1, Infinity, 10081])('rejects an invalid custom time: %s', (minutes) => {
    const fields = createStepFields();
    fields.patchValue({ timerMode: 'custom', timerMinutes: minutes });
    expect(fields.invalid).toBe(true);
  });
});
