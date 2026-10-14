import { Box, Button, Collapse, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useResetConfig, useSaveConfig } from '../../api/hooks';
import type { ConfigField as Field } from '../../api/types';
import { useT } from '../../i18n';
import { fieldErrorOf } from '../../lib/config';
import { announce } from '../Announcer';
import { ErrorState, useConfirm } from '../common';
import { ConfigField, fieldText } from './ConfigField';
import { useConfigDraft, type ConfigDraft } from './useConfigDraft';

/**
 * One group of runtime settings as a card: the fields, an optional collapsed "advanced" set, and a
 * save bar that appears only while something differs from what is stored. `children` receives the
 * draft, for whatever needs the values as they stand in the form (a connection test, a warning).
 */
export function ConfigCard({
  title,
  description,
  fields,
  advanced = [],
  advancedLabel,
  advancedHint,
  onDirtyChange,
  children,
}: {
  title: string;
  description?: string;
  fields: Field[];
  advanced?: Field[];
  advancedLabel?: string;
  advancedHint?: string;
  onDirtyChange?: (dirty: boolean) => void;
  children?: (draft: ConfigDraft) => ReactNode;
}) {
  const m = useT().config;
  const all = useMemo(() => [...fields, ...advanced], [fields, advanced]);
  const draft = useConfigDraft(all);
  const save = useSaveConfig();
  const reset = useResetConfig();
  const { confirm, dialog } = useConfirm();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const dirty = draft.isDirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // A problem inside the collapsed area must not hide behind it.
  const advancedKeys = advanced.map((field) => field.key).join(',');
  const advancedTrouble = advanced.some((field) => draft.serverErrors[field.key] || draft.localErrors[field.key]);
  useEffect(() => {
    if (advancedTrouble) setAdvancedOpen(true);
  }, [advancedTrouble, advancedKeys]);

  const submit = () => {
    if (!draft.valid || !dirty) return;
    save.mutate(draft.changed, {
      onSuccess: () => {
        draft.discard();
        notifications.show({ title: m.saveBar.savedTitle, message: m.saveBar.savedMessage });
        announce(m.saveBar.savedTitle);
      },
      onError: (error) => {
        draft.takeError(error);
      },
    });
  };

  const discard = () => {
    draft.discard();
    save.reset();
  };

  const onReset = async (field: Field) => {
    const label = fieldText(m, field.key).label;
    if (!(await confirm({ title: m.reset.title, body: m.reset.body(label), confirmLabel: m.reset.confirm }))) return;
    reset.mutate(field.key, {
      onSuccess: () => {
        draft.forget(field.key);
        notifications.show({ message: m.reset.done(label) });
        announce(m.reset.done(label));
      },
      onError: (error) => notifications.show({ color: 'red', title: m.reset.failed, message: error.message }),
    });
  };

  // A 400 that names one of these fields is shown under it; anything else needs the general message.
  const fieldError = fieldErrorOf(save.error);
  const generalError = save.error && !(fieldError && all.some((field) => field.key === fieldError.field)) ? save.error : null;

  const grid = (list: Field[]) => (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
      {list.map((field) => (
        <ConfigField key={field.key} field={field} draft={draft} onReset={onReset} />
      ))}
    </SimpleGrid>
  );

  return (
    <Paper withBorder p="lg" className="config-card">
      <Stack gap="lg">
        <Stack gap={2}>
          <Title order={4}>{title}</Title>
          {description && (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
        {fields.length > 0 && grid(fields)}
        {advanced.length > 0 && (
          <Box className="config-advanced">
            <UnstyledButton onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} className="config-advanced-toggle">
              <Group gap={6} wrap="nowrap">
                {advancedOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                <Text size="sm" fw={600}>
                  {advancedLabel}
                </Text>
                {advancedHint && (
                  <Text size="xs" c="dimmed" truncate>
                    {advancedHint}
                  </Text>
                )}
              </Group>
            </UnstyledButton>
            <Collapse expanded={advancedOpen}>
              <Box pt="md">{grid(advanced)}</Box>
            </Collapse>
          </Box>
        )}
        {children?.(draft)}
      </Stack>
      {dirty && (
        // Sticky at the foot of the card, so the save is in reach wherever the edit was made.
        <Box className="config-savebar" role="region" aria-label={m.saveBar.unsaved(draft.dirtyCount)}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm" fw={500}>
              {m.saveBar.unsaved(draft.dirtyCount)}
            </Text>
            <Group gap="xs">
              <Button variant="default" onClick={discard} disabled={save.isPending}>
                {m.saveBar.discard}
              </Button>
              <Button onClick={submit} loading={save.isPending} disabled={!draft.valid}>
                {m.saveBar.save}
              </Button>
            </Group>
          </Group>
          {generalError && (
            <Box mt="xs">
              <ErrorState error={generalError} title={m.saveBar.notSaved} />
            </Box>
          )}
        </Box>
      )}
      {dialog}
    </Paper>
  );
}
