import { Accordion, Badge, Group, Paper, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';

import { type ChangesScope, useChanges } from '../api/featureHooks';
import type { ChangeEntry, ChangeTotals, Situation } from '../api/types';
import { useT } from '../i18n';
import { fmtDateTime } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { Empty, ErrorState, IssueLink, Loading, Stat } from './common';
import { OpenInJira } from './OpenInJira';
import { RiskBadge } from './risk';

/** The sections in the order they are listed; their words come from the catalogue. */
const SECTIONS = ['new_risks', 'resolved', 'completed', 'entered', 'left', 'moved', 'reassigned', 'reopened'] as const;

function Delta({ label, before, after, better, help }: { label: string; before: number; after: number; better: 'up' | 'down'; help?: string }) {
  const t = useT();
  const delta = after - before;
  const good = delta === 0 ? null : (delta > 0) === (better === 'up');
  return (
    <Stat
      label={label}
      help={help}
      value={after}
      hint={
        <Text span size="xs" c={good == null ? 'dimmed' : good ? 'teal.8' : 'red.8'}>
          {t.shell.changes.before(delta === 0 ? t.shell.changes.same : `${delta > 0 ? '+' : ''}${delta}`, before)}
        </Text>
      }
    />
  );
}

function Totals({ before, after }: { before: ChangeTotals; after: ChangeTotals }) {
  const t = useT();
  const risky = (totals: ChangeTotals) => Object.entries(totals.situations).reduce((s, [k, n]) => (k === 'em_dia' ? s : s + n), 0);
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }}>
      <Delta label={t.shell.changes.open} help={HELP['changes:open']} before={before.open} after={after.open} better="down" />
      <Delta label={t.shell.changes.done} help={HELP['changes:done']} before={before.done} after={after.done} better="up" />
      <Delta label={t.shell.changes.atRisk} help={HELP['changes:risk']} before={risky(before)} after={risky(after)} better="down" />
      <Delta label={t.shell.changes.openPoints} help={HELP['changes:points']} before={before.open_estimate} after={after.open_estimate} better="down" />
    </SimpleGrid>
  );
}

function EntryTable({ items, kind }: { items: ChangeEntry[]; kind: string }) {
  const t = useT();
  return (
    <Table.ScrollContainer minWidth={620}>
      <Table verticalSpacing={4}>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.key}>
              <Table.Td>
                <IssueLink issue={item} />
              </Table.Td>
              <Table.Td>
                {kind === 'moved' ? (
                  <Text size="sm">
                    {item.from_status} → <b>{item.status}</b>
                  </Text>
                ) : kind === 'reassigned' ? (
                  <Text size="sm">
                    {item.from_assignee ?? t.shell.changes.nobody} → <b>{item.assignee ?? t.shell.changes.nobody}</b>
                  </Text>
                ) : (
                  <RiskBadge situation={item.situation as Situation} size="xs" />
                )}
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {kind === 'new_risks' || kind === 'resolved' ? item.reason ?? '' : item.assignee ?? ''}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/**
 * RF-74: the question every weekly meeting starts with — what changed since last week — answered
 * from the frozen checkpoints instead of two decks side by side. The default compares the last
 * checkpoint with right now; any two checkpoints can be compared. Scoped to a sprint, only that sprint's
 * checkpoints are offered, and a sprint that is not running has no "now" to compare with.
 */
export function ChangesPanel({ scope }: { scope: ChangesScope }) {
  const t = useT();
  const [since, setSince] = useState<number | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const changes = useChanges(scope, since, until);
  if (changes.isLoading) return <Loading rows={5} />;
  if (changes.error) return <ErrorState error={changes.error} />;
  const data = changes.data;
  if (!data) return null;
  if (!data.checkpoints.length) {
    return (
      <Empty title={t.shell.changes.noCheckpointTitle} action={{ label: t.shell.changes.seeStatus, to: '/status' }}>
        {t.shell.changes.noCheckpointBody}
      </Empty>
    );
  }
  const options = data.checkpoints.map((c) => ({ value: String(c.id), label: fmtDateTime(c.at) }));
  const sections = SECTIONS.map((key) => ({ key, ...t.shell.changes.sections[key], items: (data as unknown as Record<string, ChangeEntry[]>)[key] ?? [] }));
  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label={t.shell.changes.since}
          data={options}
          value={since != null ? String(since) : data.since ? String(data.since.id) : null}
          onChange={(value) => setSince(value ? Number(value) : null)}
          w={220}
          allowDeselect={false}
        />
        <Select
          label={t.shell.changes.until}
          data={data.live ? [{ value: '', label: t.shell.changes.now }, ...options] : options}
          value={until != null ? String(until) : data.until.id != null ? String(data.until.id) : ''}
          onChange={(value) => setUntil(value ? Number(value) : null)}
          w={220}
          allowDeselect={false}
        />
        <Text size="xs" c="dimmed" pb={8}>
          {t.shell.changes.sameWay}
        </Text>
      </Group>
      <Totals before={data.before} after={data.after} />
      {sections.every((s) => !s.items.length) && (
        <Text size="sm" c="dimmed">
          {t.shell.changes.nothingChanged(data.since ? fmtDateTime(data.since.at) : null, data.until.id ? fmtDateTime(data.until.at) : null)}
        </Text>
      )}
      <Paper withBorder>
        <Accordion
          multiple
          // Opened only where there is something to read: an expanded empty section is a blank box.
          defaultValue={['new_risks', 'resolved'].filter((key) => sections.find((s) => s.key === key)?.items.length)}
          chevronPosition="left"
        >
          {sections.map((section) => (
            <Accordion.Item key={section.key} value={section.key}>
              <Accordion.Control disabled={!section.items.length}>
                <Group gap="xs">
                  <Text fw={500}>{section.title}</Text>
                  <Badge variant="light" color={section.items.length ? 'petrol' : 'gray'} size="sm">
                    {section.items.length}
                  </Badge>
                  {section.hint && (
                    <Text size="xs" c="dimmed">
                      {section.hint}
                    </Text>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <Group justify="flex-end">
                    <OpenInJira keys={section.items.map((i) => i.key)} sampleUrl={section.items[0]?.url} />
                  </Group>
                  <EntryTable items={section.items} kind={section.key} />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Paper>
    </Stack>
  );
}
