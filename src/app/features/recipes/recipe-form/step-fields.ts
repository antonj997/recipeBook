import { FormControl, FormGroup } from '@angular/forms';
import type { RecipeStepDetail } from '../../../core/models/recipe-metadata';
import { isStepTimerSeconds, resolveStepTimer } from '../../../core/models/step-timer';

export function createStepFields(detail: RecipeStepDetail = {}) {
  return new FormGroup(
    {
      section: new FormControl(detail.section ?? '', { nonNullable: true }),
      imageUrl: new FormControl(detail.imageUrl ?? '', { nonNullable: true }),
      imageDataUrl: new FormControl(detail.imageDataUrl ?? '', { nonNullable: true }),
      timerMode: new FormControl<'auto' | 'custom' | 'off'>(
        detail.timerSeconds === undefined
          ? 'auto'
          : detail.timerSeconds === null
            ? 'off'
            : 'custom',
        { nonNullable: true },
      ),
      timerMinutes: new FormControl<number | null>(
        typeof detail.timerSeconds === 'number' ? detail.timerSeconds / 60 : null,
      ),
    },
    {
      validators: (group) => {
        const mode = group.get('timerMode')?.value;
        const minutes: unknown = group.get('timerMinutes')?.value;
        return mode !== 'custom' ||
          (typeof minutes === 'number' && isStepTimerSeconds(Math.round(minutes * 60)))
          ? null
          : { timer: true };
      },
    },
  );
}
export type StepFields = ReturnType<typeof createStepFields>;

export function stepTimerSetting(fields: StepFields): number | null | undefined {
  const value = fields.getRawValue();
  return value.timerMode === 'auto'
    ? undefined
    : value.timerMode === 'off'
      ? null
      : Math.round((value.timerMinutes ?? 0) * 60);
}
export function stepMetadata(fields: StepFields): RecipeStepDetail {
  const value = fields.getRawValue();
  return {
    section: value.section.trim() || undefined,
    imageUrl: value.imageUrl || undefined,
    imageDataUrl: value.imageDataUrl || undefined,
    timerSeconds: stepTimerSetting(fields),
  };
}
export function stepTimerDuration(text: string, fields?: StepFields): number | undefined {
  return resolveStepTimer(text, fields ? stepTimerSetting(fields) : undefined);
}
