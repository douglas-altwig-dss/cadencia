import { ActionIcon, Anchor, Badge, Group, NumberInput, PasswordInput, Select, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useId, useMemo, type ReactNode } from 'react';

import type { ConfigField as Field } from '../../api/types';
import { LOCALES, LOCALE_NAMES, useT, type Messages } from '../../i18n';
import { availableTimezones, canRemoveSecret, hourLabel, timezoneOptions } from '../../lib/config';
import { TIMEZONES, weekdays } from '../../lib/format';
import type { ConfigDraft } from './useConfigDraft';

let zones: string[] | null = null;
/** The browser's zone list, read once: it does not change while the page is open. */
const allTimezones = () => (zones ??= availableTimezones(TIMEZONES));

type FieldText = { label: string; description: string; placeholder: string };

/** A field's label and description from the catalogue; a key the catalogue does not know shows as itself. */
export function fieldText(m: Messages['config'], key: string): FieldText {
  return (m.fields as Record<string, FieldText | undefined>)[key] ?? { label: key, description: '', placeholder: '' };
}

/** Where the value comes from, said in a word, with the rule behind it on hover. */
export function SourceBadge({ field }: { field: Field }) {
  const m = useT().config.source;
  const look = {
    database: { color: 'petrol', variant: 'light' as const, label: m.database, help: m.databaseHelp },
    environment: { color: 'gray', variant: 'light' as const, label: m.environment, help: m.environmentHelp },
    default: { color: 'gray', variant: 'outline' as const, label: m.default, help: m.defaultHelp },
  }[field.source];
  if (!look) return null;
  const help = field.source === 'database' && field.env_value_differs ? `${look.help} ${m.envDiffers}` : look.help;
  return (
    <Tooltip label={help} multiline w={280} withArrow>
      <Badge size="xs" color={look.color} variant={look.variant} style={{ flexShrink: 0 }}>
        {look.label}
      </Badge>
    </Tooltip>
  );
}

/**
 * One runtime setting, drawn by its kind: its label, a one-line description, where the value comes
 * from and — when it is saved in the app — a way back to `.env` or the default. The value and its
 * errors live in the draft, so this only draws.
 */
export function ConfigField({ field, draft, onReset }: { field: Field; draft: ConfigDraft; onReset?: (field: Field) => void }) {
  const t = useT();
  const m = t.config;
  const id = useId();
  const descriptionId = `${id}-description`;
  const text = fieldText(m, field.key);
  const value = draft.value(field);
  const local = draft.localErrors[field.key];
  const error: ReactNode =
    draft.serverErrors[field.key] ??
    (local ? (local.code === 'required' ? m.errors.required : local.code === 'tooLow' ? m.errors.tooLow(local.limit) : m.errors.tooHigh(local.limit)) : undefined);
  const common = {
    id,
    error,
    'aria-describedby': text.description ? descriptionId : undefined,
  };
  const set = (next: string | number | boolean | null) => draft.set(field.key, next);
  const timezones = useMemo(
    () => (field.kind === 'timezone' ? timezoneOptions(allTimezones(), field.value, field.default, value) : []),
    [field.kind, field.value, field.default, value],
  );
  const number = typeof value === 'number' ? value : value === '' || value === null ? '' : Number(value);

  let control: ReactNode;
  let below: ReactNode = null;
  switch (field.kind) {
    case 'secret': {
      const state = draft.secretState(field);
      const placeholder =
        state === 'remove' ? m.secret.notSet : state === 'kept' ? (field.source === 'database' ? m.secret.saved : m.secret.fromEnv) : m.secret.notSet;
      control = (
        <PasswordInput
          {...common}
          value={typeof value === 'string' ? value : ''}
          placeholder={placeholder}
          autoComplete="new-password"
          onChange={(e) => set(e.currentTarget.value)}
        />
      );
      if (state === 'remove') {
        below = (
          <Text size="xs" c="dimmed">
            {m.secret.willRemove}{' '}
            <Anchor component="button" type="button" size="xs" onClick={() => draft.forget(field.key)}>
              {m.secret.keep}
            </Anchor>
          </Text>
        );
      } else if (canRemoveSecret(field) && state === 'kept') {
        below = (
          <Anchor component="button" type="button" size="xs" c="red" onClick={() => draft.removeSecret(field.key)} style={{ alignSelf: 'flex-start' }}>
            {m.secret.remove}
          </Anchor>
        );
      }
      break;
    }
    case 'int':
    case 'float':
      control = (
        <NumberInput
          {...common}
          value={number}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          allowDecimal={field.kind === 'float'}
          allowNegative={field.min === null || field.min < 0}
          onChange={(next) => set(next)}
        />
      );
      break;
    case 'bool':
      control = <Switch {...common} checked={Boolean(value)} onChange={(e) => set(e.currentTarget.checked)} />;
      break;
    case 'timezone':
      control = (
        <Select
          {...common}
          data={timezones}
          value={typeof value === 'string' && value ? value : null}
          onChange={(next) => next && set(next)}
          searchable
          limit={80}
          maxDropdownHeight={320}
          allowDeselect={false}
        />
      );
      break;
    case 'locale':
      control = (
        <Select
          {...common}
          data={LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] }))}
          value={typeof value === 'string' && value ? value : null}
          onChange={(next) => next && set(next)}
          allowDeselect={false}
        />
      );
      break;
    case 'weekday':
      control = (
        <Select
          {...common}
          data={weekdays().map((day, index) => ({ value: String(index), label: day }))}
          value={value === '' || value === null ? null : String(value)}
          onChange={(next) => next !== null && set(Number(next))}
          allowDeselect={false}
        />
      );
      break;
    case 'hour':
      control = (
        <Select
          {...common}
          data={Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: hourLabel(hour) }))}
          value={value === '' || value === null ? null : String(value)}
          onChange={(next) => next !== null && set(Number(next))}
          allowDeselect={false}
        />
      );
      break;
    default:
      control = (
        <TextInput
          {...common}
          type={field.kind === 'url' ? 'url' : field.kind === 'email' ? 'email' : 'text'}
          value={value === null ? '' : String(value)}
          placeholder={text.placeholder || undefined}
          onChange={(e) => set(e.currentTarget.value)}
        />
      );
  }

  return (
    <Stack gap={4}>
      <Group gap={6} wrap="nowrap" justify="space-between" align="center">
        <Text component="label" htmlFor={id} size="sm" fw={500} style={{ minWidth: 0 }}>
          {text.label}
        </Text>
        <Group gap={4} wrap="nowrap">
          <SourceBadge field={field} />
          {field.source === 'database' && onReset && (
            <Tooltip label={m.reset.tooltip} withArrow>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={m.reset.aria(text.label)} onClick={() => onReset(field)}>
                <IconArrowBackUp size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      {text.description && (
        <Text id={descriptionId} size="xs" c="dimmed">
          {text.description}
        </Text>
      )}
      {control}
      {below}
    </Stack>
  );
}
