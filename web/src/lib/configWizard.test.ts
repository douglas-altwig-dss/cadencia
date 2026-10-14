import { describe, expect, it } from 'vitest';

import type { ConfigField, ConfigView } from '../api/types';
import { WIZARD_STEPS, fieldsOfStep, isRecommended, stepOfField, wizardLayout } from './configWizard';

const field = (key: string, kind: ConfigField['kind'] = 'int', value: ConfigField['value'] = 1, extra: Partial<ConfigField> = {}): ConfigField => ({
  key,
  kind,
  value,
  is_set: true,
  source: 'default',
  default: value,
  min: null,
  max: null,
  env_value_differs: false,
  ...extra,
});

const view: ConfigView = {
  groups: [
    { id: 'jira', fields: [field('jira_base_url', 'url', ''), field('jira_max_retries')] },
    { id: 'calendar', fields: [field('timezone', 'timezone', 'UTC')] },
    { id: 'general', fields: [field('locale', 'locale', 'en-US')] },
    { id: 'collection', fields: [field('history_days')] },
    { id: 'notifications', fields: [field('smtp_host', 'string', '')] },
    { id: 'ai', fields: [field('ai_enabled', 'bool', false)] },
    { id: 'someday', fields: [field('new_thing')] },
  ],
  bootstrap: [],
  jira_configured: false,
  importable: [],
};

describe('the wizard layout', () => {
  const layout = wizardLayout(view);

  it('asks for every runtime field somewhere', () => {
    const asked = Object.values(layout).flatMap(fieldsOfStep).map((f) => f.key).sort();
    const all = view.groups.flatMap((g) => g.fields).map((f) => f.key).sort();
    expect(asked).toEqual(all);
  });

  it('keeps the credential on step 1 and folds how Jira is asked into collection', () => {
    expect(layout.jira.main.map((f) => f.key)).toEqual(['jira_base_url']);
    expect(layout.collection.advanced.map((f) => f.key)).toEqual(['jira_max_retries']);
  });

  it('puts general settings, and groups it does not know, under the calendar step', () => {
    expect(layout.calendar.general.map((f) => f.key)).toEqual(['locale', 'new_thing']);
  });

  it('finds the step of a field the server names', () => {
    expect(WIZARD_STEPS[stepOfField(layout, 'jira_max_retries')]).toBe('collection');
    expect(WIZARD_STEPS[stepOfField(layout, 'locale')]).toBe('calendar');
    expect(stepOfField(layout, 'nope')).toBe(-1);
  });

  it('has no fields before the server answers', () => {
    expect(Object.values(wizardLayout(undefined)).flatMap(fieldsOfStep)).toEqual([]);
  });
});

describe('recommended values', () => {
  it('compares as the API reads the value', () => {
    const timeout = field('jira_timeout_seconds', 'float', 30, { default: 30 });
    expect(isRecommended(timeout, '30')).toBe(true);
    expect(isRecommended(timeout, 45)).toBe(false);
  });
});
