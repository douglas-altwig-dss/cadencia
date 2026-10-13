import { Button, Group, NumberInput, Paper, SimpleGrid, Slider, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import { usePersonAvailability, useSaveAvailability } from '../../api/hooks';
import type { CapacitySprint } from '../../api/types';
import { fmtNum } from '../../lib/format';
import { ErrorState, Loading, Note } from '../common';
import { axisStyle, EChart } from '../EChart';
import { AbsenceEditor } from './AbsenceEditor';

/** Time this person gives to the tracked boards: their own day length and share, then absences. */
function Availability({ accountId }: { accountId: string }) {
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
  const dirty = (hours === '' ? null : Number(hours)) !== data.hours_per_day || allocation !== data.allocation;
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={5}>Disponibilidade de tempo</Title>
        <Group align="flex-start" wrap="wrap" gap="lg">
          <NumberInput
            label="Horas por dia"
            description={`vazio: ${fmtNum(data.board_hours_per_day)} h, do board`}
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
              Dedicação a estes boards: {allocation}%
            </Text>
            <Slider
              value={allocation}
              onChange={setAllocation}
              min={0}
              max={100}
              step={5}
              marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
              aria-label="Dedicação em porcentagem"
            />
            <Text size="xs" c="dimmed">
              A parte do tempo da pessoa que vai para os boards acompanhados; o resto é de outro time ou de outra frente.
            </Text>
          </Stack>
        </Group>
        <Text size="sm" c="dimmed">
          Rende cerca de <b className="num">{fmtNum(perDay)} h</b> de trabalho por dia útil ({fmtNum(hours === '' ? data.board_hours_per_day : Number(hours))} h × foco{' '}
          {data.board_focus_factor} × {allocation}%).
        </Text>
        {save.error && <ErrorState error={save.error} title="Disponibilidade não salva" />}
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
            Voltar ao padrão
          </Button>
          <Button
            disabled={!dirty}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { hours_per_day: hours === '' ? null : Number(hours), allocation },
                { onSuccess: () => notifications.show({ title: 'Disponibilidade salva', message: 'A capacidade já usa os novos valores.' }) },
              )
            }
          >
            Salvar
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function SprintChart({ sprints }: { sprints: CapacitySprint[] }) {
  if (!sprints.length) {
    return (
      <Text size="sm" c="dimmed">
        A pessoa ainda não tem sprints com itens nos boards acompanhados.
      </Text>
    );
  }
  const names = sprints.map((s) => s.sprint.name);
  return (
    <EChart
      label={`Capacidade, comprometido e entregue por sprint, em horas: ${sprints
        .map((s) => `${s.sprint.name}: capacidade ${fmtNum(s.capacity_hours)}, comprometido ${fmtNum(s.committed_hours)}, entregue ${fmtNum(s.delivered_hours)}`)
        .join('; ')}`}
      deps={[sprints]}
      height={280}
      build={(p) => ({
        tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmtNum(Number(v))} h` },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', data: names, ...axisStyle(p) },
        yAxis: { type: 'value', name: 'horas', ...axisStyle(p) },
        series: [
          { name: 'Capacidade', type: 'bar', itemStyle: { color: p.todo }, data: sprints.map((s) => s.capacity_hours) },
          { name: 'Comprometido', type: 'bar', itemStyle: { color: p.added }, data: sprints.map((s) => s.committed_hours) },
          { name: 'Entregue', type: 'bar', itemStyle: { color: p.done }, data: sprints.map((s) => s.delivered_hours) },
        ],
      })}
    />
  );
}

/** Capacity per sprint against what was committed, and the two things that change it: availability and absences. */
export function PersonCapacity({ accountId, sprints }: { accountId: string; sprints: CapacitySprint[] }) {
  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Title order={5} mb="xs">
          Capacidade por sprint
        </Title>
        <SprintChart sprints={sprints} />
        <Text size="xs" c="dimmed" mt="xs">
          Capacidade = dias úteis × horas × foco × dedicação, menos as ausências. Comprometido e entregue vêm das estimativas convertidas em horas pelo
          board; a disponibilidade de hoje vale para as sprints passadas também.
        </Text>
      </Paper>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Availability accountId={accountId} />
        <Paper withBorder p="md">
          <Title order={5} mb="sm">
            Ausências
          </Title>
          <AbsenceEditor accountId={accountId} />
        </Paper>
      </SimpleGrid>
      <Note>
        A disponibilidade também entra na capacidade das telas de sprint e de alocação. As ausências de todo o time ficam no botão Ausências, em Pessoas.
      </Note>
    </Stack>
  );
}
