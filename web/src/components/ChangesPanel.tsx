import { Accordion, Badge, Group, Paper, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';

import { useChanges } from '../api/featureHooks';
import type { ChangeEntry, ChangeTotals, Situation } from '../api/types';
import { fmtDateTime } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { Empty, ErrorState, IssueLink, Loading, Stat } from './common';
import { OpenInJira } from './OpenInJira';
import { RiskBadge } from './risk';

const SECTIONS: { key: string; title: string; hint: string }[] = [
  { key: 'new_risks', title: 'Novos riscos', hint: 'ficaram em situação pior do que estavam' },
  { key: 'resolved', title: 'Riscos resolvidos', hint: 'melhoraram ou foram concluídos' },
  { key: 'completed', title: 'Concluídos', hint: 'entraram numa categoria de concluído' },
  { key: 'entered', title: 'Entraram', hint: 'não estavam no escopo no início' },
  { key: 'left', title: 'Saíram', hint: 'estavam no escopo e não estão mais' },
  { key: 'moved', title: 'Mudaram de status', hint: '' },
  { key: 'reassigned', title: 'Mudaram de responsável', hint: '' },
  { key: 'reopened', title: 'Reabertos', hint: 'estavam concluídos e voltaram' },
];

function Delta({ label, before, after, better, help }: { label: string; before: number; after: number; better: 'up' | 'down'; help?: string }) {
  const delta = after - before;
  const good = delta === 0 ? null : (delta > 0) === (better === 'up');
  return (
    <Stat
      label={label}
      help={help}
      value={after}
      hint={
        <Text span size="xs" c={good == null ? 'dimmed' : good ? 'teal.8' : 'red.8'}>
          {delta === 0 ? 'igual' : `${delta > 0 ? '+' : ''}${delta}`} · antes {before}
        </Text>
      }
    />
  );
}

function Totals({ before, after }: { before: ChangeTotals; after: ChangeTotals }) {
  const risky = (t: ChangeTotals) => Object.entries(t.situations).reduce((s, [k, n]) => (k === 'em_dia' ? s : s + n), 0);
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }}>
      <Delta label="Em aberto" help={HELP['changes:open']} before={before.open} after={after.open} better="down" />
      <Delta label="Concluídos" help={HELP['changes:done']} before={before.done} after={after.done} better="up" />
      <Delta label="Em risco" help={HELP['changes:risk']} before={risky(before)} after={risky(after)} better="down" />
      <Delta label="Pontos em aberto" help={HELP['changes:points']} before={before.open_estimate} after={after.open_estimate} better="down" />
    </SimpleGrid>
  );
}

function EntryTable({ items, kind }: { items: ChangeEntry[]; kind: string }) {
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
                    {item.from_assignee ?? 'ninguém'} → <b>{item.assignee ?? 'ninguém'}</b>
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
 * checkpoint with right now; any two checkpoints can be compared.
 */
export function ChangesPanel({ boardId }: { boardId: number }) {
  const [since, setSince] = useState<number | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const changes = useChanges(boardId, since, until);
  if (changes.isLoading) return <Loading rows={5} />;
  if (changes.error) return <ErrorState error={changes.error} />;
  const data = changes.data;
  if (!data) return null;
  if (!data.checkpoints.length) {
    return (
      <Empty title="Ainda não há checkpoint congelado" action={{ label: 'Ver o status da coleta', to: '/status' }}>
        O primeiro checkpoint é gravado no horário semanal do board, depois de uma coleta. A partir dele esta aba compara a semana.
      </Empty>
    );
  }
  const options = data.checkpoints.map((c) => ({ value: String(c.id), label: fmtDateTime(c.at) }));
  const sections = SECTIONS.map((s) => ({ ...s, items: (data as unknown as Record<string, ChangeEntry[]>)[s.key] ?? [] }));
  return (
    <Stack gap="md">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Desde o checkpoint"
          data={options}
          value={since != null ? String(since) : data.since ? String(data.since.id) : null}
          onChange={(value) => setSince(value ? Number(value) : null)}
          w={220}
          allowDeselect={false}
        />
        <Select
          label="Até"
          data={[{ value: '', label: 'agora' }, ...options]}
          value={until != null ? String(until) : ''}
          onChange={(value) => setUntil(value ? Number(value) : null)}
          w={220}
          allowDeselect={false}
        />
        <Text size="xs" c="dimmed" pb={8}>
          Os dois lados são lidos do mesmo jeito que os checkpoints são congelados.
        </Text>
      </Group>
      <Totals before={data.before} after={data.after} />
      {sections.every((s) => !s.items.length) && (
        <Text size="sm" c="dimmed">
          Nada mudou entre {data.since ? fmtDateTime(data.since.at) : 'o início'} e {data.until.id ? fmtDateTime(data.until.at) : 'agora'}.
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
