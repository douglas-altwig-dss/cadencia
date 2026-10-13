import { Alert, Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconChartLine } from '@tabler/icons-react';

import type { ForecastView } from '../api/types';
import { useT } from '../i18n';
import { fmtDay, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { ErrorState, InfoTip, Loading, Tipped } from './common';
import { OpenInJira } from './OpenInJira';

function Point({ label, days, date, help }: { label: string; days: number | null; date: string | null; help?: string }) {
  const t = useT();
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        <Tipped help={help}>{label}</Tipped>
      </Text>
      <Text fw={600} className="num" ta="left">
        {date ? fmtDay(date) : t.shell.forecast.afterAYear}
      </Text>
      <Text size="xs" c="dimmed">
        {days == null ? '—' : t.shell.forecast.businessDays(days)}
      </Text>
    </Stack>
  );
}

/**
 * RF-72: the Monte Carlo forecast in the terms a planning conversation uses — "85% de chance de
 * terminar até dd/mm" — with its sample and its caveats on the card, not in a footnote.
 */
export function ForecastCard({ query }: { query: { data?: ForecastView; isLoading: boolean; error: unknown } }) {
  const t = useT();
  if (query.isLoading) return <Loading rows={2} />;
  if (query.error) return <ErrorState error={query.error} title={t.shell.forecast.unavailable} />;
  const view = query.data;
  if (!view) return null;
  const f = view.forecast;
  const sprint = view.scope === 'sprint';
  const nothingLeft =
    view.scope === 'sprint' ? t.shell.forecast.nothingLeft.sprint : view.scope === 'board' ? t.shell.forecast.nothingLeft.board : t.shell.forecast.nothingLeft.epic;
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <IconChartLine size={18} aria-hidden />
            <Text fw={600}>{t.shell.forecast.title}</Text>
            <Group gap={4} wrap="nowrap">
              <Badge variant="outline" color="gray" size="xs">
                Monte Carlo
              </Badge>
              <InfoTip label={HELP['forecast:method']} about={t.shell.forecast.title} width={320} />
            </Group>
            {f.low_confidence && (
              <Group gap={4} wrap="nowrap">
                <Badge variant="outline" color="yellow" size="xs">
                  {t.shell.forecast.lowConfidence}
                </Badge>
                <InfoTip label={HELP['forecast:low']} about={t.shell.forecast.confidence} />
              </Group>
            )}
          </Group>
          <OpenInJira keys={view.remaining_keys} label={t.shell.forecast.remainingInJira} />
        </Group>
        {f.remaining === 0 ? (
          <Text size="sm">{nothingLeft}</Text>
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
                    {t.shell.forecast.chance(<b key="remaining">{f.remaining}</b>, view.end ? fmtDay(view.end) : null)}
                    <InfoTip label={HELP['forecast:probability']} about={t.shell.forecast.chanceAbout} />
                  </Text>
                  <Text fw={700} className="num">
                    {fmtPct(f.probability)}
                  </Text>
                </Group>
                <Progress
                  value={f.probability * 100}
                  color={f.probability >= 0.85 ? 'teal' : f.probability >= 0.5 ? 'yellow' : 'red'}
                  aria-label={t.shell.forecast.chanceLabel(fmtPct(f.probability))}
                />
                <Text size="xs" c="dimmed">
                  {t.shell.forecast.untilEnd(f.horizon_days ?? 0)}
                </Text>
              </Stack>
            )}
            <SimpleGrid cols={3}>
              <Point label={t.shell.forecast.p50} days={f.p50_days} date={f.p50_date} help={HELP['forecast:percentiles']} />
              <Point label={t.shell.forecast.p85} days={f.p85_days} date={f.p85_date} help={HELP['forecast:percentiles']} />
              <Point label={t.shell.forecast.p95} days={f.p95_days} date={f.p95_date} help={HELP['forecast:percentiles']} />
            </SimpleGrid>
          </>
        )}
        <Text size="xs" c="dimmed">
          {t.shell.forecast.sample(f.delivered_in_sample, f.sample_days)} {view.caveat ?? ''}
        </Text>
      </Stack>
    </Paper>
  );
}
