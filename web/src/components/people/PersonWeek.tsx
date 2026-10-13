import { Alert, Badge, Button, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconEye } from '@tabler/icons-react';
import { useRef, useState } from 'react';

import type { PersonDetail, PersonItem, WeekSignal, WeekStatus } from '../../api/types';
import { fmtDate, plural } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { type Severity } from '../../lib/people';
import { InfoTip, IssueLink, KpiCard } from '../common';
import { RiskBadge } from '../risk';
import { loadPercent, SeverityBadge } from './indicators';

const STATUS: Record<WeekStatus, { label: string; color: string; icon: React.ReactNode; text: string }> = {
  ok: { label: 'Semana em ordem', color: 'teal', icon: <IconCheck size={16} />, text: 'Nenhum sinal de dificuldade nos itens abertos.' },
  atencao: { label: 'Pede atenção', color: 'yellow', icon: <IconEye size={16} />, text: 'Há sinais que vale olhar antes que virem problema.' },
  dificuldades: { label: 'Com dificuldades', color: 'red', icon: <IconAlertTriangle size={16} />, text: 'Há sinais fortes: uma conversa costuma ajudar mais que um número.' },
};

export function signalText(signal: WeekSignal): string {
  const n = signal.count ?? 0;
  switch (signal.kind) {
    case 'sobrecarga':
      return `Carga em ${loadPercent(signal.ratio ?? null)} da capacidade que resta.`;
    case 'bloqueios': {
      const parts = [
        signal.alta ? `${signal.alta} de gravidade alta` : '',
        signal.media ? `${signal.media} média` : '',
        signal.baixa ? `${signal.baixa} baixa` : '',
      ].filter(Boolean);
      return `${plural(n, 'bloqueio aberto', 'bloqueios abertos')} (${parts.join(', ')}).`;
    }
    case 'atrasados':
      return `${plural(n, 'item com prazo vencido', 'itens com prazo vencido')}.`;
    case 'parados':
      return `${plural(n, 'item parado', 'itens parados')} há mais de um checkpoint, sem estar bloqueado.`;
    case 'vencendo':
      return `${plural(n, 'item vence', 'itens vencem')} nos próximos 7 dias.`;
  }
}

/**
 * A signal that names items narrows the "Pedem um olhar" list to them. The predicates follow the backend's
 * rules for each signal (analytics/person_detail._week), so a signal's count and its list agree.
 */
type ItemSignal = Exclude<WeekSignal['kind'], 'sobrecarga'>;
const SIGNAL_ITEMS: Record<ItemSignal, { label: string; match: (i: PersonItem) => boolean }> = {
  bloqueios: { label: 'bloqueados', match: (i) => i.open && Boolean(i.blocked) },
  atrasados: { label: 'com prazo vencido', match: (i) => i.open && i.due_in_days != null && i.due_in_days < 0 },
  parados: { label: 'parados', match: (i) => i.open && !i.blocked && Boolean(i.risk?.evidence.some((e) => e.rule === 'estagnacao')) },
  vencendo: { label: 'vencendo em 7 dias', match: (i) => i.open && i.due_in_days != null && i.due_in_days >= 0 && i.due_in_days <= 7 },
};

/** A signal's level read on the one severity palette the blocks use (M28). */
const LEVEL_SEVERITY: Record<'alto' | 'medio' | 'baixo', Severity> = { alto: 'alta', medio: 'media', baixo: 'baixa' };

function ItemRows({ items, empty }: { items: PersonItem[]; empty: string }) {
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
              {item.open && item.risk ? <RiskBadge situation={item.risk.situation} size="xs" /> : <Badge variant="light" color="teal" size="xs">concluído</Badge>}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** How the week is going: the signals first, in words; then what needs a look and what got done. */
export function PersonWeek({ detail }: { detail: PersonDetail }) {
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
            {status.label} · semana de {fmtDate(week.week_start)}
            <InfoTip label={HELP['week:status']} about="classificação da semana" />
          </>
        }
      >
        <Stack gap={6}>
          <Text size="sm">{status.text}</Text>
          {week.signals.map((item) => (
            <Group key={item.kind} gap="xs" wrap="nowrap" align="flex-start">
              {/* Filled, not light: a light badge on this light alert is red on pink and hard to read. */}
              <SeverityBadge level={LEVEL_SEVERITY[item.level]} variant="filled" size="sm" w={62} />
              {item.kind === 'sobrecarga' ? (
                <Text size="sm">{signalText(item)}</Text>
              ) : (
                <Button variant="subtle" size="compact-sm" fw="normal" c="inherit" justify="flex-start" onClick={() => pick(item.kind as ItemSignal)} aria-label={`${signalText(item)} Ver na lista`}>
                  {signalText(item)}
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </Alert>
      {/* The due dates are in the signals above and in the list below, so they are not counted again here. */}
      <SimpleGrid cols={2}>
        <KpiCard label="Em andamento" value={week.counts.in_progress} help={HELP['week:in_progress']}>
          de {plural(week.counts.open, 'item aberto', 'itens abertos')}
        </KpiCard>
        <KpiCard label="Concluídos na semana" value={week.counts.finished} help={HELP['week:finished']} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Stack gap="xs" ref={attentionRef} style={{ scrollMarginTop: 76 }}>
          <Group gap="xs" justify="space-between">
            <Title order={5}>Pedem um olhar</Title>
            {signal && (
              <Button variant="subtle" size="compact-xs" onClick={() => setSignal(null)}>
                Mostrar todos
              </Button>
            )}
          </Group>
          {signal && (
            <Text size="xs" c="dimmed">
              Só os itens {SIGNAL_ITEMS[signal].label}
            </Text>
          )}
          <ItemRows
            items={shown.slice(0, 12)}
            empty={signal ? 'Nenhum item neste sinal.' : 'Nada bloqueado, atrasado ou vencendo.'}
          />
        </Stack>
        <Stack gap="xs">
          <Title order={5}>Concluídos nesta semana</Title>
          <ItemRows items={finished.slice(0, 12)} empty="Nada concluído ainda nesta semana." />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
