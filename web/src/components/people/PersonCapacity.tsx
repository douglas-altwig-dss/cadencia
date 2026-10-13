import { Button, Group, NumberInput, Paper, SimpleGrid, Slider, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import { usePersonAvailability, useSaveAvailability } from '../../api/hooks';
import type { CapacitySprint } from '../../api/types';
import { useT } from '../../i18n';
import { fmtNum } from '../../lib/format';
import { ErrorState, Loading, Note } from '../common';
import { axisStyle, EChart } from '../EChart';
import { AbsenceEditor } from './AbsenceEditor';

/** Time this person gives to the tracked boards: their own day length and share, then absences. */
function Availability({ accountId }: { accountId: string }) {
  const t = useT();
  const tc = t.people.capacity;
  const availability = usePersonAvailability(accountId);
  const save = useSaveAvailability(accountId);
  const [hours, setHours] = useState<number | string>('');
  const [allocation, setAllocation] = useState(100);
  useEffect(() => {
    if (!availability.data) return;
    setHours(availability.data.hours_per_day ?? '');
    setAllocation(availability.data.allocation);
  }, [availability.data]);

  if (availability.isLoading) return <Loading rows={2} />;
  if (availability.error) return <ErrorState error={availability.error} />;
  const data = availability.data!;
  const perDay = (hours === '' ? data.board_hours_per_day : Number(hours)) * data.board_focus_factor * (allocation / 100);
  const shownHours = fmtNum(hours === '' ? data.board_hours_per_day : Number(hours));
  const [yieldsBefore, yieldsAfter] = tc.yields(shownHours, data.board_focus_factor, allocation).split('{amount}');
  const dirty = (hours === '' ? null : Number(hours)) !== data.hours_per_day || allocation !== data.allocation;
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={5}>{tc.availabilityTitle}</Title>
        <Group align="flex-start" wrap="wrap" gap="lg">
          <NumberInput
            label={tc.hoursPerDay}
            description={tc.hoursEmpty(fmtNum(data.board_hours_per_day))}
            placeholder={`${data.board_hours_per_day}`}
            value={hours}
            onChange={setHours}
            min={0.5}
            max={24}
            step={0.5}
            decimalScale={1}
            w={200}
          />
          <Stack gap={4} style={{ flex: 1, minWidth: 220 }}>
            <Text size="sm" fw={500}>
              {tc.allocation(allocation)}
            </Text>
            <Slider
              value={allocation}
              onChange={setAllocation}
              min={0}
              max={100}
              step={5}
              marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
              aria-label={tc.allocationAria}
            />
            <Text size="xs" c="dimmed">
              {tc.allocationHint}
            </Text>
          </Stack>
        </Group>
        <Text size="sm" c="dimmed">
          {yieldsBefore}
          <b className="num">{fmtNum(perDay)} h</b>
          {yieldsAfter}
        </Text>
        {save.error && <ErrorState error={save.error} title={tc.notSaved} />}
        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={data.hours_per_day == null && data.allocation === 100 && hours === '' && allocation === 100}
            onClick={() => {
              setHours('');
              setAllocation(100);
              save.mutate({ hours_per_day: null, allocation: 100 });
            }}
          >
            {tc.reset}
          </Button>
          <Button
            disabled={!dirty}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { hours_per_day: hours === '' ? null : Number(hours), allocation },
                { onSuccess: () => notifications.show({ title: tc.savedTitle, message: tc.savedMessage }) },
              )
            }
          >
            {t.people.common.save}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function SprintChart({ sprints }: { sprints: CapacitySprint[] }) {
  const t = useT();
  const tc = t.people.capacity;
  if (!sprints.length) {
    return (
      <Text size="sm" c="dimmed">
        {tc.noSprints}
      </Text>
    );
  }
  const names = sprints.map((s) => s.sprint.name);
  return (
    <EChart
      label={tc.chartLabel(
        sprints
          .map((s) => tc.chartPoint(s.sprint.name, fmtNum(s.capacity_hours), fmtNum(s.committed_hours), fmtNum(s.delivered_hours)))
          .join('; '),
      )}
      deps={[sprints]}
      height={280}
      build={(p) => ({
        tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmtNum(Number(v))} h` },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', data: names, ...axisStyle(p) },
        yAxis: { type: 'value', name: tc.axisHours, ...axisStyle(p) },
        series: [
          { name: t.people.common.capacity, type: 'bar', itemStyle: { color: p.todo }, data: sprints.map((s) => s.capacity_hours) },
          { name: t.people.common.committed, type: 'bar', itemStyle: { color: p.added }, data: sprints.map((s) => s.committed_hours) },
          { name: t.people.common.delivered, type: 'bar', itemStyle: { color: p.done }, data: sprints.map((s) => s.delivered_hours) },
        ],
      })}
    />
  );
}

/** Capacity per sprint against what was committed, and the two things that change it: availability and absences. */
export function PersonCapacity({ accountId, sprints }: { accountId: string; sprints: CapacitySprint[] }) {
  const t = useT();
  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Title order={5} mb="xs">
          {t.people.capacity.perSprintTitle}
        </Title>
        <SprintChart sprints={sprints} />
        <Text size="xs" c="dimmed" mt="xs">
          {t.people.capacity.formula}
        </Text>
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Availability accountId={accountId} />
        <Paper withBorder p="md">
          <Title order={5} mb="sm">
            {t.people.list.absences}
          </Title>
          <AbsenceEditor accountId={accountId} />
        </Paper>
      </SimpleGrid>
      <Note>
        {t.people.capacity.footNote}
      </Note>
    </Stack>
  );
}
