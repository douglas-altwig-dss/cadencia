// Pure layout of the configuration wizard (`pages/ConfigWizardPage.tsx`): which step asks for which
// runtime field. Every field of `GET /config` lands on some step — one the layout does not name goes
// to its group's step — so a field the server adds later is still asked for and still saved.

import type { ConfigField, ConfigValue, ConfigView } from '../api/types';
import { normalize } from './config';

export const WIZARD_STEPS = ['jira', 'calendar', 'collection', 'notifications', 'ai', 'review'] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

/** Where a field sits inside its step: the main form, the "General" subheading, or the collapsed advanced area. */
export type WizardSection = 'main' | 'general' | 'advanced';

export type WizardStep = Record<WizardSection, ConfigField[]>;
export type WizardLayout = Record<Exclude<WizardStepId, 'review'>, WizardStep>;

/** The fields that do not sit on their own group's step, or not in its main form. */
const PLACED: Record<string, [Exclude<WizardStepId, 'review'>, WizardSection]> = {
  // The credential is step 1; how hard Jira is asked is a matter of collection, so it waits there, folded.
  jira_max_concurrency: ['collection', 'advanced'],
  jira_max_retries: ['collection', 'advanced'],
  jira_timeout_seconds: ['collection', 'advanced'],
};

/** The step of each group; a group the wizard does not know goes under "General" on the calendar step. */
const GROUP_STEP: Record<string, [Exclude<WizardStepId, 'review'>, WizardSection]> = {
  jira: ['jira', 'main'],
  calendar: ['calendar', 'main'],
  general: ['calendar', 'general'],
  collection: ['collection', 'main'],
  notifications: ['notifications', 'main'],
  ai: ['ai', 'main'],
};

const emptyStep = (): WizardStep => ({ main: [], general: [], advanced: [] });

export function wizardLayout(view: ConfigView | undefined): WizardLayout {
  const layout: WizardLayout = { jira: emptyStep(), calendar: emptyStep(), collection: emptyStep(), notifications: emptyStep(), ai: emptyStep() };
  for (const group of view?.groups ?? []) {
    for (const field of group.fields) {
      const [step, section] = PLACED[field.key] ?? GROUP_STEP[group.id] ?? ['calendar', 'general'];
      layout[step][section].push(field);
    }
  }
  return layout;
}

/** Every field a step asks for, in the order it shows them. */
export const fieldsOfStep = (step: WizardStep): ConfigField[] => [...step.main, ...step.general, ...step.advanced];

/** The index in `WIZARD_STEPS` of the step that asks for `key`, or -1 when no step does. */
export function stepOfField(layout: WizardLayout, key: string): number {
  return WIZARD_STEPS.findIndex((id) => id !== 'review' && fieldsOfStep(layout[id]).some((field) => field.key === key));
}

/** Whether a field's value, as it stands in the form, is the built-in recommended one. */
export function isRecommended(field: ConfigField, value: ConfigValue): boolean {
  return normalize(field, value) === normalize(field, field.default);
}
