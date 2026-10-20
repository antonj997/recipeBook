import { describe, expect, it } from 'vitest';
import { detectStepTimer, formatCountdown, resolveStepTimer, recipeStepTimers } from './step-timer';
import { readRecipeMetadata } from './recipe-metadata';

describe('conservative English and Swedish step timers', () => {
  it.each([
    ['Cook for 30 minutes, stirring occasionally.', 1800],
    ['Koka i en minut.', 60],
    ['Vispa i 1 sekund.', 1],
    ['Låt jäsa i en dag.', 86400],
    ['Bake for 1/2 hour.', 1800],
    ['Let rise for 1 1/2 hours.', 5400],
    ['Let rise for one and a half hours.', 5400],
    ['Låt jäsa en och en halv timme.', 5400],
    ['Cook for ¼ hour.', 900],
    ['Cook for 1¾ hours.', 6300],
    ['Låt vila en kvart.', 900],
    ['Bake for approx. 30 minutes.', 1800],
    ['Koka i ca. 10 minuter.', 600],
    ['Tillaga i ugnen i 30-40 minuter tills gyllene.', 1800],
    ['Baka i 20–25 min på 200 grader.', 1200],
    ['Låt sjuda i cirka 15 minuter.', 900],
    ['Låt degen jäsa 1 timme och 30 minuter.', 5400],
    ['Let the dough rise for 1 hour 30 minutes.', 5400],
    ['Chill for 1.5 hours before serving.', 5400],
    ['Låt vila en halvtimme.', 1800],
    ['Let rest for half an hour.', 1800],
    ['Stek i 1,5 minuter på varje sida.', 90],
    ['Microwave for 45 seconds.', 45],
    ['Vispa i 30 sekunder tills slätt.', 30],
    ['Bake for 20 to 25 minutes, then rest for 10 minutes.', 1200],
    ['30 minuter i ugnen på 180°C.', 1800],
    ['Refrigerate for at least 2 hours.', 7200],
  ])('detects a useful countdown for %s', (text, seconds) => {
    expect(detectStepTimer(text)).toBe(seconds);
  });
  it.each([
    'Preheat the oven to 200 degrees.',
    'Värm ugnen till 180 grader.',
    'Use 30 ml oil and 2 eggs.',
    'This recipe takes 30 minutes in total.',
    'Receptet tar totalt 40 minuter.',
    'Remove from the fridge 30 minutes before cooking.',
    'Ta ut köttet 20 minuter innan du ska steka det.',
    'Can be prepared 2 days in advance.',
    'Keeps in the fridge for 3 days.',
    'Förvaras i kylen i 2 dagar.',
    'Serve within 10 minutes.',
    'Bake until golden, up to 20 minutes.',
    'Cook for a few minutes.',
    'Marinate overnight.',
    'Wait 0 minutes.',
    'Cook for 1/0 hour.',
  ])('does not invent a timer for %s', (text) => {
    expect(detectStepTimer(text)).toBeUndefined();
  });
  it('keeps explicit settings authoritative for old and new recipes', () => {
    expect(resolveStepTimer('Bake for 30 minutes.')).toBe(1800);
    expect(resolveStepTimer('Bake for 30 minutes.', null)).toBeUndefined();
    expect(resolveStepTimer('Bake for 30 minutes.', 120)).toBe(120);
    expect(resolveStepTimer('Stir until smooth.', 60)).toBe(60);
    expect(resolveStepTimer('Stir until smooth.', -1)).toBeUndefined();
  });
  it('formats countdowns without changing digit widths each second', () => {
    expect(formatCountdown(1800)).toBe('30:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(3600)).toBe('60:00');
    expect(formatCountdown(5400)).toBe('90:00');
    expect(formatCountdown(0)).toBe('00:00');
  });
});

describe('timer settings in recipe metadata and backups', () => {
  it('preserves long timer definitions and their identity for background alert validation', () => {
    const recipe = {
      id: 'slow-cook',
      title: 'Stew',
      servings: 4,
      ingredients: ['Beans'],
      instructions: ['Simmer until tender.'],
      stepDetails: [{ timerSeconds: 7200 }],
    };
    const timer = recipeStepTimers(recipe)[0]!;
    expect(timer.seconds).toBe(7200);
    expect(recipe.stepDetails[0].timerSeconds).toBe(7200);
    expect(
      recipeStepTimers({ ...recipe, stepDetails: [{ timerSeconds: 10800 }] })[0]!.key,
    ).not.toBe(timer.key);
    expect(resolveStepTimer('Simmer until tender.', 7200)).toBe(7200);
    expect(
      readRecipeMetadata({ stepDetails: [{ timerSeconds: 604800 }] }, true).stepDetails,
    ).toEqual([{ timerSeconds: 604800 }]);
  });
  it('preserves the complete automatically detected duration in timer definitions', () => {
    const recipe = {
      id: 'long-rest',
      title: 'Bread',
      servings: 4,
      ingredients: ['Flour'],
      instructions: ['Let rise for 2 hours.'],
    };
    expect(recipeStepTimers(recipe)[0]!.seconds).toBe(7200);
    expect(detectStepTimer(recipe.instructions[0])).toBe(7200);
  });
  it('keeps the same timer identity for raw and displayed legacy step titles', () => {
    const recipe = {
      id: 'legacy',
      title: 'Bread',
      servings: 4,
      ingredients: ['Flour'],
      instructions: ['Cook for 2 minutes.'],
      stepDetails: [{ title: 'Bake' }],
    };
    expect(recipeStepTimers(recipe)).toEqual(
      recipeStepTimers({ ...recipe, instructions: ['Bake: Cook for 2 minutes.'] }),
    );
  });
  it('retains custom durations and explicit removal alongside step details', () => {
    const source = {
      instructions: ['Cook.', 'Rest.', 'Serve.'],
      stepDetails: [{ timerSeconds: 1800, section: 'Cooking' }, { timerSeconds: null }, {}],
    };
    expect(readRecipeMetadata(source, true).stepDetails).toEqual(source.stepDetails);
  });
  it.each([-1, 0, 0.5, 604801, '30', true])('rejects invalid timer data: %s', (timerSeconds) => {
    expect(() => readRecipeMetadata({ stepDetails: [{ timerSeconds }] }, true)).toThrow();
  });
});
