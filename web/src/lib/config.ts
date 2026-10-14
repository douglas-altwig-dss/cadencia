// Pure rules behind the runtime configuration screens (docs/config-store.md): what a draft shows,
// what a save sends, and how the API's answer maps back onto a field. Settings and the configuration
// wizard both read them, so a field behaves the same wherever it is edited.

import { ApiError } from '../api/client';
import type { ConfigField, ConfigValue, ConfigView, JiraDraftTest } from '../api/types';

/**
 * Edits waiting to be saved, keyed by field. Only touched keys are present; everything else shows
 * the server's value. For a secret, a typed string replaces it and `null` means "remove it".
 */
export type Edits = Record<string, ConfigValue>;

/** The value that marks a secret for removal in `Edits`. */
export const REMOVE_SECRET = null;

const TEXT_KINDS = new Set(['string', 'url', 'email', 'secret', 'timezone', 'locale']);
const NUMBER_KINDS = new Set(['int', 'float', 'weekday', 'hour']);

export const isNumeric = (field: Pick<ConfigField, 'kind'>) => NUMBER_KINDS.has(field.kind);

/** The fields of one group, or none when the server does not know it. */
export function fieldsOf(view: ConfigView | undefined, groupId: string): ConfigField[] {
  return view?.groups.find((group) => group.id === groupId)?.fields ?? [];
}

/** What an untouched control shows. A secret is never sent back, so its input starts empty. */
export function initialValue(field: ConfigField): ConfigValue {
  if (field.kind === 'secret') return '';
  if (field.kind === 'bool') return Boolean(field.value);
  if (field.value === null || field.value === undefined) return '';
  return field.value;
}

/** What the control for `field` shows now: the edit when there is one, else the server's value. */
export function displayValue(field: ConfigField, edits: Edits): ConfigValue {
  return Object.prototype.hasOwnProperty.call(edits, field.key) ? edits[field.key] : initialValue(field);
}

/** A value in the form the API takes: text trimmed, numbers as numbers, an empty number as null. */
export function normalize(field: Pick<ConfigField, 'kind'>, value: ConfigValue): ConfigValue {
  if (value === null || value === undefined) return null;
  if (field.kind === 'bool') return Boolean(value);
  if (isNumeric(field)) {
    if (typeof value === 'number') return value;
    const text = String(value).trim();
    if (text === '') return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  if (TEXT_KINDS.has(field.kind)) return String(value).trim();
  return value;
}

/** How a secret's control stands: a new one typed, marked for removal, kept as it is, or absent. */
export type SecretState = 'replace' | 'remove' | 'kept' | 'unset';

export function secretState(field: ConfigField, edits: Edits): SecretState {
  const edit = Object.prototype.hasOwnProperty.call(edits, field.key) ? edits[field.key] : undefined;
  if (edit === REMOVE_SECRET && field.source === 'database') return 'remove';
  if (typeof edit === 'string' && edit.trim() !== '') return 'replace';
  return field.is_set ? 'kept' : 'unset';
}

/** Only a secret saved in the app can be removed; one from `.env` is the deployment's to change. */
export const canRemoveSecret = (field: ConfigField) => field.kind === 'secret' && field.is_set && field.source === 'database';

/**
 * The body of `PUT /config`: only the keys whose value really changed. A secret goes only when a new
 * one was typed, or as `""` when its removal was asked for; leaving its box empty keeps it.
 */
export function changedValues(fields: ConfigField[], edits: Edits): Record<string, ConfigValue> {
  const changed: Record<string, ConfigValue> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(edits, field.key)) continue;
    if (field.kind === 'secret') {
      const state = secretState(field, edits);
      if (state === 'replace') changed[field.key] = String(edits[field.key]).trim();
      else if (state === 'remove') changed[field.key] = '';
      continue;
    }
    const next = normalize(field, edits[field.key]);
    const current = normalize(field, initialValue(field));
    if (next !== current) changed[field.key] = next;
  }
  return changed;
}

/** A problem found before anything is sent; the catalogue words it. */
export type LocalError = { code: 'required' } | { code: 'tooLow' | 'tooHigh'; limit: number };

/** Numbers must be present and inside the field's bounds; the server checks everything else. */
export function localErrors(fields: ConfigField[], edits: Edits): Record<string, LocalError> {
  const errors: Record<string, LocalError> = {};
  for (const field of fields) {
    if (!isNumeric(field) || !Object.prototype.hasOwnProperty.call(edits, field.key)) continue;
    const value = normalize(field, edits[field.key]);
    if (value === null) errors[field.key] = { code: 'required' };
    else if (typeof value === 'number' && field.min !== null && value < field.min) errors[field.key] = { code: 'tooLow', limit: field.min };
    else if (typeof value === 'number' && field.max !== null && value > field.max) errors[field.key] = { code: 'tooHigh', limit: field.max };
  }
  return errors;
}

/** A 400 that names its field (`{"detail": {"field": ...}}`), so the message can sit under that field. */
export function fieldErrorOf(error: unknown): { field: string; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const field = error.detail.field;
  if (typeof field !== 'string' || !field) return null;
  return { field, message: error.detail.message ?? error.detail.cause ?? error.message };
}

/**
 * The body of `POST /config/jira/test`: the URL and e-mail as they stand in the form, and the token
 * only when a new one was typed (an omitted token tests the stored one).
 */
export function jiraTestBody(fields: ConfigField[], edits: Edits): JiraDraftTest {
  const body: JiraDraftTest = {};
  for (const field of fields) {
    if (field.key === 'jira_base_url' || field.key === 'jira_email') {
      const value = normalize(field, displayValue(field, edits));
      if (typeof value === 'string' && value) body[field.key] = value;
    } else if (field.key === 'jira_api_token' && secretState(field, edits) === 'replace') {
      body.jira_api_token = String(edits[field.key]).trim();
    }
  }
  return body;
}

/** "07:00": an hour of the day as a clock reads it. */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** Every IANA zone the browser knows, or `fallback` where it cannot list them; UTC is always there. */
export function availableTimezones(fallback: readonly string[]): string[] {
  let zones: readonly string[] = fallback;
  try {
    const listed = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (listed && listed.length) zones = listed;
  } catch {
    // An engine without the list keeps the short one.
  }
  return [...new Set([...zones, 'UTC'])];
}

/** The region a zone is filed under: "America" for "America/Sao_Paulo", the name itself for "UTC". */
const regionOf = (zone: string) => (zone.includes('/') ? zone.slice(0, zone.indexOf('/')) : zone);

/**
 * The offered time zones plus whatever the field holds now (so a value saved elsewhere still shows),
 * grouped by region and sorted, in the shape a grouped Select takes.
 */
export function timezoneOptions(offered: readonly string[], ...current: ConfigValue[]): { group: string; items: string[] }[] {
  const extra = current.filter((value): value is string => typeof value === 'string' && value !== '');
  const groups = new Map<string, string[]>();
  for (const zone of new Set([...offered, ...extra])) {
    const region = regionOf(zone);
    groups.set(region, [...(groups.get(region) ?? []), zone]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({ group, items: items.sort((a, b) => a.localeCompare(b)) }));
}
