import { Alert, Badge, Button, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconEye } from '@tabler/icons-react';
import { useRef, useState } from 'react';

import type { PersonDetail, PersonItem, WeekSignal, WeekStatus } from '../../api/types';
import { t as catalog, useT } from '../../i18n';
import { fmtDate } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { type Severity } from '../../lib/people';
import { InfoTip, IssueLink, KpiCard } from '../common';
import { RiskBadge } from '../risk';
import { loadPercent, SeverityBadge } from './indicators';

/** Each status's colour and icon; its words come from the catalogue (`people.week.status`). */
const STATUS: Record<WeekStatus, { color: string; icon: React.ReactNode }> = {
  ok: { color: 'teal', icon: <IconCheck size={16} /> },
  atencao: { color: 'yellow', icon: <IconEye size={16} /> },
  dificuldades: { color: 'red', icon: <IconAlertTriangle size={16} /> },
};

export function signalText(signal: WeekSignal): string {
  const n = signal.count ?? 0;
  const tw = catalog().people.week;
  switch (signal.kind) {
    case 'sobrecarga':
      return tw.overload(loadPercent(signal.ratio ?? null));
    case 'bloqueios': {
      const parts = [
        signal.alta ? tw.blocksHigh(signal.alta) : '',
        signal.media ? tw.blocksMedium(signal.media) : '',
        signal.baixa ? tw.blocksLow(signal.baixa) : '',
      ].filter(Boolean);
      return tw.blocks(n, parts.join(', '));
    }
    case 'atrasados':
      return tw.overdue(n);
    case 'parados':
      return tw.stalled(n);
    case 'vencendo':
      return tw.dueSoon(n);
  }
}

/**
 * A signal that names items narrows the "Pedem um olhar" list to them. The predicates follow the backend's
 * rules for each signal (analytics/person_detail._week), so a signal's count and its list agree.
 */
type ItemSignal = Exclude<WeekSignal['kind'], 'sobrecarga'>;
const SIGNAL_ITEMS: Record<ItemSignal, { match: (i: PersonItem) => boolean }> = {
  bloqueios: { match: (i) => i.open && Boolean(i.blocked) },
  atrasados: { match: (i) => i.open && i.due_in_days != null && i.due_in_days < 0 },
  parados: { match: (i) => i.open && !i.blocked && Boolean(i.risk?.evidence.some((e) => e.rule === 'estagnacao')) },
  vencendo: { match: (i) => i.open && i.due_in_days != null && i.due_in_days >= 0 && i.due_in_days <= 7 },
};

/** A signal's level read on the one severity palette the blocks use (M28). */
const LEVEL_SEVERITY: Record<'alto' | 'medio' | 'baixo', Severity> = { alto: 'alta', medio: 'media', baixo: 'baixa' };

function ItemRows({ items, empty }: { items: PersonItem[]; empty: string }) {
  const t = useT();
  if (!items.length) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <Table verticalSpacing="xs">
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.key}>
            <Table.Td>
              <IssueLink issue={item} />
            </Table.Td>
            <Table.Td w={140}>
              {item.open && item.risk ? <RiskBadge situation={item.risk.situation} size="xs" /> : <Badge variant="light" color="teal" size="xs">{t.people.common.done}</Badge>}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** How the week is going: the signals first, in words; then what needs a look and what got done. */
export function PersonWeek({ detail }: { detail: PersonDetail }) {
  const t = useT();
  const tw = t.people.week;
  const { week, items } = detail;
  const status = STATUS[week.status];
  const monday = new Date(week.week_start);
  const finished = items.filter((i) => !i.open && i.done_at && new Date(i.done_at) >= monday);
  const attention = items.filter(
    (i) => i.open && (i.blocked || (i.due_in_days != null && i.due_in_days <= 7) || i.risk?.situation !== 'em_dia'),
  );
  // A signal that names items is a button: it scrolls to the list and narrows it to those items.
  const [signal, setSignal] = useState<ItemSignal | null>(null);
  const attentionRef = useRef<HTMLDivElement>(null);
  const shown = signal ? attention.filter(SIGNAL_ITEMS[signal].match) : attention;
  const pick = (kind: ItemSignal) => {
    setSignal(kind);
    attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <Stack gap="lg">
      <Alert
        variant="light"
        color={status.color}
        icon={status.icon}
        title={
          <>
            {tw.alertTitle(tw.status[week.status].label, fmtDate(week.week_start))}
            <InfoTip label={HELP['week:status']} about={tw.statusAbout} />
          </>
        }
      >
        <Stack gap={6}>
          <Text size="sm">{tw.status[week.status].text}</Text>
          {week.signals.map((item) => (
            <Group key={item.kind} gap="xs" wrap="nowrap" align="flex-start">
              {/* Filled, not light: a light badge on this light alert is red on pink and hard to read. */}
              <SeverityBadge level={LEVEL_SEVERITY[item.level]} variant="filled" size="sm" w={62} />
              {item.kind === 'sobrecarga' ? (
                <Text size="sm">{signalText(item)}</Text>
              ) : (
                <Button variant="subtle" size="compact-sm" fw="normal" c="inherit" justify="flex-start" onClick={() => pick(item.kind as ItemSignal)} aria-label={tw.seeInList(signalText(item))}>
                  {signalText(item)}
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </Alert>
      {/* The due dates are in the signals above and in the list below, so they are not counted again here. */}
      <SimpleGrid cols={2}>
        <KpiCard label={tw.inProgress} value={week.counts.in_progress} help={HELP['week:in_progress']}>
          {tw.ofOpen(week.counts.open)}
        </KpiCard>
        <KpiCard label={tw.finishedWeek} value={week.counts.finished} help={HELP['week:finished']} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Stack gap="xs" ref={attentionRef} style={{ scrollMarginTop: 76 }}>
          <Group gap="xs" justify="space-between">
            <Title order={5}>{tw.needLook}</Title>
            {signal && (
              <Button variant="subtle" size="compact-xs" onClick={() => setSignal(null)}>
                {tw.showAll}
              </Button>
            )}
          </Group>
          {signal && (
            <Text size="xs" c="dimmed">
              {tw.onlyItems[signal]}
            </Text>
          )}
          <ItemRows
            items={shown.slice(0, 12)}
            empty={signal ? tw.emptySignal : tw.emptyAttention}
          />
        </Stack>
        <Stack gap="xs">
          <Title order={5}>{tw.finishedTitle}</Title>
          <ItemRows items={finished.slice(0, 12)} empty={tw.emptyFinished} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
