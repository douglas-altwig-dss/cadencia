import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/client';
import type { ConfigField } from '../api/types';
import {
  REMOVE_SECRET,
  availableTimezones,
  canRemoveSecret,
  changedValues,
  displayValue,
  fieldErrorOf,
  hourLabel,
  jiraTestBody,
  localErrors,
  secretState,
  timezoneOptions,
} from './config';

const field = (key: string, kind: ConfigField['kind'], value: ConfigField['value'], extra: Partial<ConfigField> = {}): ConfigField => ({
  key,
  kind,
  value,
  is_set: value !== null && value !== '',
  source: 'database',
  default: null,
  min: null,
  max: null,
  env_value_differs: false,
  ...extra,
});

const url = field('jira_base_url', 'url', 'https://x.atlassian.net');
const email = field('jira_email', 'email', 'a@x.com');
const token = field('jira_api_token', 'secret', null, { is_set: true });
const retries = field('jira_max_retries', 'int', 5, { min: 0, max: 20 });
const starttls = field('smtp_starttls', 'bool', true);
const hour = field('checkpoint_hour', 'hour', 18);

describe('what a save sends', () => {
  it('sends nothing when nothing was touched or an edit was put back', () => {
    expect(changedValues([url, retries], {})).toEqual({});
    expect(changedValues([url, retries, starttls], { jira_base_url: ' https://x.atlassian.net ', jira_max_retries: '5', smtp_starttls: true })).toEqual({});
  });

  it('sends only the changed keys, in the form the API takes', () => {
    expect(changedValues([url, retries, starttls, hour], { jira_max_retries: '7', smtp_starttls: false, checkpoint_hour: 9 })).toEqual({
      jira_max_retries: 7,
      smtp_starttls: false,
      checkpoint_hour: 9,
    });
    expect(changedValues([url], { jira_base_url: '  https://y.atlassian.net ' })).toEqual({ jira_base_url: 'https://y.atlassian.net' });
  });

  it('sends an emptied number as null so the server refuses it rather than guessing', () => {
    expect(changedValues([retries], { jira_max_retries: '' })).toEqual({ jira_max_retries: null });
  });
});

describe('secrets', () => {
  it('keeps a saved secret while its box stays empty', () => {
    expect(changedValues([token], { jira_api_token: '' })).toEqual({});
    expect(changedValues([token], { jira_api_token: '   ' })).toEqual({});
    expect(secretState(token, {})).toBe('kept');
  });

  it('replaces it only when one is typed', () => {
    expect(changedValues([token], { jira_api_token: ' abc ' })).toEqual({ jira_api_token: 'abc' });
    expect(secretState(token, { jira_api_token: 'abc' })).toBe('replace');
  });

  it('clears it with an empty string when removal is asked for', () => {
    expect(changedValues([token], { jira_api_token: REMOVE_SECRET })).toEqual({ jira_api_token: '' });
    expect(secretState(token, { jira_api_token: REMOVE_SECRET })).toBe('remove');
  });

  it('cannot remove one that comes from the environment', () => {
    const fromEnv = { ...token, source: 'environment' as const };
    expect(canRemoveSecret(fromEnv)).toBe(false);
    expect(changedValues([fromEnv], { jira_api_token: REMOVE_SECRET })).toEqual({});
    expect(canRemoveSecret(token)).toBe(true);
  });

  it('never shows a stored secret in its box', () => {
    expect(displayValue(token, {})).toBe('');
    expect(secretState({ ...token, is_set: false, source: 'default' }, {})).toBe('unset');
  });
});

describe('checks before sending', () => {
  it('asks for a number and keeps it inside the bounds', () => {
    expect(localErrors([retries], { jira_max_retries: '' })).toEqual({ jira_max_retries: { code: 'required' } });
    expect(localErrors([retries], { jira_max_retries: 21 })).toEqual({ jira_max_retries: { code: 'tooHigh', limit: 20 } });
    expect(localErrors([retries], { jira_max_retries: -1 })).toEqual({ jira_max_retries: { code: 'tooLow', limit: 0 } });
    expect(localErrors([retries, url], { jira_max_retries: 3, jira_base_url: '' })).toEqual({});
  });
});

describe('server errors', () => {
  it('maps a 400 that names a field onto it', () => {
    const error = new ApiError(400, { cause: 'Invalid value', message: 'Not a time zone', field: 'timezone' });
    expect(fieldErrorOf(error)).toEqual({ field: 'timezone', message: 'Not a time zone' });
  });

  it('leaves any other failure to the general error', () => {
    expect(fieldErrorOf(new ApiError(400, { message: 'bad' }))).toBeNull();
    expect(fieldErrorOf(new ApiError(500, { message: 'x', field: 'timezone' }))).toBeNull();
    expect(fieldErrorOf(new Error('x'))).toBeNull();
  });
});

describe('testing a draft connection', () => {
  it('sends the URL and e-mail as typed, and the token only when a new one was typed', () => {
    expect(jiraTestBody([url, email, token], { jira_email: ' b@x.com ' })).toEqual({
      jira_base_url: 'https://x.atlassian.net',
      jira_email: 'b@x.com',
    });
    expect(jiraTestBody([url, email, token], { jira_api_token: 'new' })).toMatchObject({ jira_api_token: 'new' });
    expect(jiraTestBody([url, email, token], { jira_api_token: REMOVE_SECRET })).not.toHaveProperty('jira_api_token');
  });
});

describe('options', () => {
  it('labels hours as a clock does', () => {
    expect(hourLabel(7)).toBe('07:00');
    expect(hourLabel(23)).toBe('23:00');
  });

  it('keeps a saved time zone the list does not offer', () => {
    expect(timezoneOptions(['UTC'], 'Europe/Berlin', null, 'UTC')).toEqual([
      { group: 'Europe', items: ['Europe/Berlin'] },
      { group: 'UTC', items: ['UTC'] },
    ]);
  });

  it('groups time zones by region, sorted', () => {
    expect(timezoneOptions(['America/Sao_Paulo', 'Europe/Lisbon', 'America/Manaus', 'America/Sao_Paulo'])).toEqual([
      { group: 'America', items: ['America/Manaus', 'America/Sao_Paulo'] },
      { group: 'Europe', items: ['Europe/Lisbon'] },
    ]);
  });

  it('offers every zone the browser knows, and always UTC', () => {
    const zones = availableTimezones(['America/Sao_Paulo']);
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/Sao_Paulo');
  });
});
