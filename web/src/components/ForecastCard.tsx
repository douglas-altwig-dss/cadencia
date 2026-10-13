import { Alert, Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconChartLine } from '@tabler/icons-react';

import type { ForecastView } from '../api/types';
import { fmtDay, fmtPct, plural } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { ErrorState, InfoTip, Loading, Tipped } from './common';
import { OpenInJira } from './OpenInJira';

function Point({ label, days, date, help }: { label: string; days: number | null; date: string | null; help?: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        <Tipped help={help}>{label}</Tipped>
      </Text>
      <Text fw={600} className="num" ta="left">
        {date ? fmtDay(date) : 'depois de 1 ano'}
      </Text>
      <Text size="xs" c="dimmed">
        {days == null ? '—' : plural(days, 'dia útil', 'dias úteis')}
      </Text>
    </Stack>
  );
}

/**
 * RF-72: the Monte Carlo forecast in the terms a planning conversation uses — "85% de chance de
 * terminar até dd/mm" — with its sample and its caveats on the card, not in a footnote.
 */
export function ForecastCard({ query }: { query: { data?: ForecastView; isLoading: boolean; error: unknown } }) {
  if (query.isLoading) return <Loading rows={2} />;
  if (query.error) return <ErrorState error={query.error} title="Previsão indisponível" />;
  const view = query.data;
  if (!view) return null;
  const f = view.forecast;
  const sprint = view.scope === 'sprint';
  const noun = view.scope === 'sprint' ? 'a sprint' : view.scope === 'board' ? 'o board' : 'o épico';
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <IconChartLine size={18} aria-hidden />
            <Text fw={600}>Previsão de entrega</Text>
            <Group gap={4} wrap="nowrap">
              <Badge variant="outline" color="gray" size="xs">
                Monte Carlo
              </Badge>
              <InfoTip label={HELP['forecast:method']} about="Previsão de entrega" width={320} />
            </Group>
            {f.low_confidence && (
              <Group gap={4} wrap="nowrap">
                <Badge variant="outline" color="yellow" size="xs">
                  baixa confiança
                </Badge>
                <InfoTip label={HELP['forecast:low']} about="Confiança da previsão" />
              </Group>
            )}
          </Group>
          <OpenInJira keys={view.remaining_keys} label="Restantes no Jira" />
        </Group>
        {f.remaining === 0 ? (
          <Text size="sm">Nada restante: {noun} está concluíd{noun[0]}.</Text>
        ) : f.reason && f.p50_days == null ? (
          <Alert variant="light" color="yellow">
            {f.reason}
          </Alert>
        ) : (
          <>
            {sprint && f.probability != null && !view.closed && (
              <Stack gap={4}>
                <Group justify="space-between">
                  <Text size="sm">
                    Chance de terminar os <b>{f.remaining}</b> itens restantes até o fim da sprint
                    {view.end ? ` (${fmtDay(view.end)})` : ''}
                    <InfoTip label={HELP['forecast:probability']} about="chance de terminar a tempo" />
                  </Text>
                  <Text fw={700} className="num">
                    {fmtPct(f.probability)}
                  </Text>
                </Group>
                <Progress
                  value={f.probability * 100}
                  color={f.probability >= 0.85 ? 'teal' : f.probability >= 0.5 ? 'yellow' : 'red'}
                  aria-label={`Chance de terminar a tempo: ${fmtPct(f.probability)}`}
                />
                <Text size="xs" c="dimmed">
                  {plural(f.horizon_days ?? 0, 'dia útil', 'dias úteis')} até o fim.
                </Text>
              </Stack>
            )}
            <SimpleGrid cols={3}>
              <Point label="50% de chance até" days={f.p50_days} date={f.p50_date} help={HELP['forecast:percentiles']} />
              <Point label="85% de chance até" days={f.p85_days} date={f.p85_date} help={HELP['forecast:percentiles']} />
              <Point label="95% de chance até" days={f.p95_days} date={f.p95_date} help={HELP['forecast:percentiles']} />
            </SimpleGrid>
          </>
        )}
        <Text size="xs" c="dimmed">
          Amostra: {plural(f.delivered_in_sample, 'item concluído', 'itens concluídos')} em {plural(f.sample_days, 'dia útil', 'dias úteis')}. {view.caveat ?? ''}
        </Text>
      </Stack>
    </Paper>
  );
}
