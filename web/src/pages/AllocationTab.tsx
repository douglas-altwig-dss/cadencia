import { Alert, Anchor, Badge, Button, Group, MultiSelect, NumberInput, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconCheck, IconFlask, IconScale, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useAllocation, useCapacity, useCreateAllocation, useSimulate, type Simulation } from '../api/hooks';
import type { PersonLoad, PlanView, WorkloadState } from '../api/types';
import { ErrorState, Loading, Stat } from '../components/common';
import { StateBadge } from '../components/people/indicators';
import { useT } from '../i18n';
import { fmtNum, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';

/** The planning's load states are the same rule Pessoas uses, so they read with the same words and badges. */
const LOAD_STATE: Record<PersonLoad['state'], WorkloadState> = {
  sobrecarga: 'acima',
  ociosidade: 'folga',
  equilibrado: 'ok',
  sem_capacidade: 'sem_capacidade',
};

function PlanResult({ view }: { view: PlanView }) {
  const comparison = view.comparison;
  const m = useT().tracking.planning;
  return (
    <Stack gap="md">
      {/* The model's limits are stated where the numbers appear, not only in the PRD. */}
      <Alert color="yellow" variant="light" icon={<IconScale size={18} />} title={m.disclaimerTitle}>
        {view.disclaimer}
      </Alert>
      {view.plan.warnings.length > 0 && (
        <Alert color="orange" variant="light" title={m.warnings}>
          {view.plan.warnings.join(' ')}
        </Alert>
      )}
      <Stat label={m.adherence} help={HELP['planning:adherence']} value={fmtPct(comparison.adherence)} hint={m.adherenceHint(comparison.matches, comparison.compared)} />
      <Text size="sm" c="dimmed">
        {m.parameters(
          fmtNum(Number(view.plan.parameters.focus_factor ?? 0), 2),
          fmtNum(Number(view.plan.parameters.hours_per_point ?? 0)),
          fmtNum(Number(view.plan.parameters.unestimated_item_hours ?? 0)),
        )}{' '}
        <Anchor component={Link} to="/settings?tab=profile" size="sm">
          {m.profileLink}
        </Anchor>
      </Text>
      <Title order={5}>{m.loadByPerson}</Title>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.colPerson}</Table.Th>
              <Table.Th className="num">{m.colCapacity}</Table.Th>
              <Table.Th className="num">{m.colPlanned}</Table.Th>
              <Table.Th className="num">{m.colActual}</Table.Th>
              <Table.Th className="num">{m.colDeviation}</Table.Th>
              <Table.Th>{m.colReading}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comparison.people.map((p) => (
              <Table.Tr key={p.account_id}>
                <Table.Td>{p.display_name}</Table.Td>
                <Table.Td className="num">{fmtNum(p.capacity_hours)}</Table.Td>
                <Table.Td className="num">{fmtNum(p.planned_hours)}</Table.Td>
                <Table.Td className="num">{fmtNum(p.actual_hours)}</Table.Td>
                <Table.Td className="num">{fmtPct(p.deviation)}</Table.Td>
                <Table.Td>
                  <StateBadge state={LOAD_STATE[p.state]} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Title order={5}>{m.itemsTitle}</Title>
      <Table.ScrollContainer minWidth={800}>
        <Table verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.colItem}</Table.Th>
              <Table.Th className="num">{m.colCost}</Table.Th>
              <Table.Th>{m.colRule}</Table.Th>
              <Table.Th>{m.colPlannedTo}</Table.Th>
              <Table.Th>{m.colActualTo}</Table.Th>
              <Table.Th>{m.colMatch}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {view.items.map((i) => (
              <Table.Tr key={i.key}>
                <Table.Td>
                  <Text size="sm">
                    <span className="mono">{i.key}</span> {i.summary}
                  </Text>
                </Table.Td>
                <Table.Td className="num">{fmtNum(i.cost_hours)}</Table.Td>
                <Table.Td>{m.rules[i.rule] ?? i.rule}</Table.Td>
                <Table.Td>{i.planned ?? '—'}</Table.Td>
                <Table.Td>{i.actual ?? m.unassigned}</Table.Td>
                <Table.Td>
                  {i.match ? (
                    <Group gap={4}>
                      <IconCheck size={14} aria-hidden /> {m.yes}
                    </Group>
                  ) : (
                    <Group gap={4}>
                      <IconX size={14} aria-hidden /> {m.no}
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function SimulationPanel({ sprintId, people }: { sprintId: number; people: { value: string; label: string }[] }) {
  const simulate = useSimulate(sprintId);
  const [focus, setFocus] = useState<number | string>('');
  const [hours, setHours] = useState<number | string>('');
  const [remove, setRemove] = useState<string[]>([]);
  const [extraName, setExtraName] = useState('');
  const [extraHours, setExtraHours] = useState<number | string>('');
  const m = useT().tracking.planning;

  const run = () => {
    const body: Simulation = {};
    if (focus !== '') body.focus_factor = Number(focus);
    if (hours !== '') body.hours_per_day = Number(hours);
    if (remove.length) body.remove_people = remove;
    if (extraName && extraHours !== '')
      body.add_people = [{ account_id: `simulada:${extraName}`, display_name: m.simulatedName(extraName), capacity_hours: Number(extraHours) }];
    simulate.mutate(body);
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <IconFlask size={18} />
          <Title order={5}>{m.whatIf}</Title>
        </Group>
        <Group align="flex-end" wrap="wrap">
          <NumberInput label={m.focusFactor} min={0.1} max={1} step={0.05} decimalScale={2} value={focus} onChange={setFocus} w={140} />
          <NumberInput label={m.hoursPerDay} min={1} max={12} value={hours} onChange={setHours} w={130} />
          <MultiSelect label={m.removePeople} data={people} value={remove} onChange={setRemove} w={260} clearable />
          <TextInput label={m.extraPerson} placeholder={m.extraPersonPlaceholder} value={extraName} onChange={(e) => setExtraName(e.currentTarget.value)} w={160} />
          <NumberInput label={m.capacity} min={0} value={extraHours} onChange={setExtraHours} w={130} />
          <Button onClick={run} loading={simulate.isPending}>
            {m.simulate}
          </Button>
        </Group>
        {simulate.error && <ErrorState error={simulate.error} />}
        {simulate.data && (
          <>
            <Badge variant="outline">{m.simulated}</Badge>
            <PlanResult view={simulate.data} />
          </>
        )}
      </Stack>
    </Paper>
  );
}

/** RF-25 … RF-29: theoretical capacity, greedy distribution and comparison with reality. */
export function AllocationTab({ sprintId }: { sprintId: number }) {
  const capacity = useCapacity(sprintId);
  const allocation = useAllocation(sprintId);
  const create = useCreateAllocation(sprintId);
  const m = useT().tracking.planning;

  if (capacity.isLoading || allocation.isLoading) return <Loading rows={6} />;
  if (capacity.error) return <ErrorState error={capacity.error} />;
  const people = (capacity.data?.items ?? []).map((c) => ({ value: c.account_id, label: c.display_name }));
  const plan = allocation.data && 'items' in allocation.data ? (allocation.data as PlanView) : null;

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={4}>{m.capacityTitle}</Title>
        <Text size="sm" c="dimmed">
          {m.capacityHint}
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{m.colPerson}</Table.Th>
                <Table.Th className="num">{m.colWorkingDays}</Table.Th>
                <Table.Th className="num">{m.colAbsences}</Table.Th>
                <Table.Th className="num">{m.colHoursPerDay}</Table.Th>
                <Table.Th className="num">{m.colFocus}</Table.Th>
                <Table.Th className="num">{m.colCapacity}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(capacity.data?.items ?? []).map((c) => (
                <Table.Tr key={c.account_id}>
                  <Table.Td>{c.display_name}</Table.Td>
                  <Table.Td className="num">{c.working_days}</Table.Td>
                  <Table.Td className="num">{c.absence_days}</Table.Td>
                  <Table.Td className="num">{fmtNum(c.hours_per_day)}</Table.Td>
                  <Table.Td className="num">{fmtNum(c.focus_factor, 2)}</Table.Td>
                  <Table.Td className="num">{fmtNum(c.hours)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="sm">{m.total(fmtNum(capacity.data?.total_hours))}</Text>
      </Stack>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={4}>{m.distributionTitle}</Title>
          <Button onClick={() => create.mutate()} loading={create.isPending} variant={plan ? 'default' : 'filled'}>
            {plan ? m.recalculate : m.calculate}
          </Button>
        </Group>
        {create.error && <ErrorState error={create.error} />}
        {plan ? <PlanResult view={plan} /> : <Text size="sm" c="dimmed">{m.noPlan}</Text>}
      </Stack>
      <SimulationPanel sprintId={sprintId} people={people} />
    </Stack>
  );
}
