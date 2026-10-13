import { Alert, Anchor, Badge, Button, Group, MultiSelect, NumberInput, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconCheck, IconFlask, IconScale, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useAllocation, useCapacity, useCreateAllocation, useSimulate, type Simulation } from '../api/hooks';
import type { PersonLoad, PlanView, WorkloadState } from '../api/types';
import { ErrorState, Loading, Stat } from '../components/common';
import { StateBadge } from '../components/people/indicators';
import { fmtNum, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';

const RULES: Record<string, string> = {
  afinidade_explicita: 'afinidade explícita',
  afinidade_historica: 'afinidade histórica',
  capacidade: 'maior folga',
  sem_capacidade: 'sem capacidade',
};
/** The planning's load states are the same rule Pessoas uses, so they read with the same words and badges. */
const LOAD_STATE: Record<PersonLoad['state'], WorkloadState> = {
  sobrecarga: 'acima',
  ociosidade: 'folga',
  equilibrado: 'ok',
  sem_capacidade: 'sem_capacidade',
};

function PlanResult({ view }: { view: PlanView }) {
  const comparison = view.comparison;
  return (
    <Stack gap="md">
      {/* The model's limits are stated where the numbers appear, not only in the PRD. */}
      <Alert color="yellow" variant="light" icon={<IconScale size={18} />} title="Linha de base heurística, não verdade">
        {view.disclaimer}
      </Alert>
      {view.plan.warnings.length > 0 && (
        <Alert color="orange" variant="light" title="Avisos da alocação">
          {view.plan.warnings.join(' ')}
        </Alert>
      )}
      <Stat label="Aderência de atribuição" help={HELP['planning:adherence']} value={fmtPct(comparison.adherence)} hint={`${comparison.matches} de ${comparison.compared} itens caíram em quem o modelo previu`} />
      <Text size="sm" c="dimmed">
        Parâmetros: foco {fmtNum(Number(view.plan.parameters.focus_factor ?? 0), 2)} · {fmtNum(Number(view.plan.parameters.hours_per_point ?? 0))} h/ponto ·{' '}
        {fmtNum(Number(view.plan.parameters.unestimated_item_hours ?? 0))} h sem estimativa · ajustar em{' '}
        <Anchor component={Link} to="/configuracao?tab=perfil" size="sm">
          Configuração → Perfil do board
        </Anchor>
      </Text>
      <Title order={5}>Carga por pessoa</Title>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pessoa</Table.Th>
              <Table.Th className="num">Capacidade (h)</Table.Th>
              <Table.Th className="num">Carga prevista (h)</Table.Th>
              <Table.Th className="num">Carga real (h)</Table.Th>
              <Table.Th className="num">Desvio</Table.Th>
              <Table.Th>Leitura</Table.Th>
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
      <Title order={5}>Itens: previsto × real</Title>
      <Table.ScrollContainer minWidth={800}>
        <Table verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th className="num">Custo (h)</Table.Th>
              <Table.Th>Regra</Table.Th>
              <Table.Th>Previsto</Table.Th>
              <Table.Th>Real</Table.Th>
              <Table.Th>Coincide</Table.Th>
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
                <Table.Td>{RULES[i.rule] ?? i.rule}</Table.Td>
                <Table.Td>{i.planned ?? '—'}</Table.Td>
                <Table.Td>{i.actual ?? 'sem responsável'}</Table.Td>
                <Table.Td>
                  {i.match ? (
                    <Group gap={4}>
                      <IconCheck size={14} aria-hidden /> sim
                    </Group>
                  ) : (
                    <Group gap={4}>
                      <IconX size={14} aria-hidden /> não
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

  const run = () => {
    const body: Simulation = {};
    if (focus !== '') body.focus_factor = Number(focus);
    if (hours !== '') body.hours_per_day = Number(hours);
    if (remove.length) body.remove_people = remove;
    if (extraName && extraHours !== '')
      body.add_people = [{ account_id: `simulada:${extraName}`, display_name: `${extraName} (simulada)`, capacity_hours: Number(extraHours) }];
    simulate.mutate(body);
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <IconFlask size={18} />
          <Title order={5}>E se…? (simulação, nada é gravado)</Title>
        </Group>
        <Group align="flex-end" wrap="wrap">
          <NumberInput label="Fator de foco" min={0.1} max={1} step={0.05} decimalScale={2} value={focus} onChange={setFocus} w={140} />
          <NumberInput label="Horas por dia" min={1} max={12} value={hours} onChange={setHours} w={130} />
          <MultiSelect label="Tirar pessoas" data={people} value={remove} onChange={setRemove} w={260} clearable />
          <TextInput label="Pessoa a mais" placeholder="nome" value={extraName} onChange={(e) => setExtraName(e.currentTarget.value)} w={160} />
          <NumberInput label="Capacidade (h)" min={0} value={extraHours} onChange={setExtraHours} w={130} />
          <Button onClick={run} loading={simulate.isPending}>
            Simular
          </Button>
        </Group>
        {simulate.error && <ErrorState error={simulate.error} />}
        {simulate.data && (
          <>
            <Badge variant="outline">resultado simulado</Badge>
            <PlanResult view={simulate.data} />
          </>
        )}
      </Stack>
    </Paper>
  );
}

/** RF-25 … RF-29: theoretical capacity, greedy distribution and comparison with reality. */
export function PlanningTab({ sprintId }: { sprintId: number }) {
  const capacity = useCapacity(sprintId);
  const allocation = useAllocation(sprintId);
  const create = useCreateAllocation(sprintId);

  if (capacity.isLoading || allocation.isLoading) return <Loading rows={6} />;
  if (capacity.error) return <ErrorState error={capacity.error} />;
  const people = (capacity.data?.items ?? []).map((c) => ({ value: c.account_id, label: c.display_name }));
  const plan = allocation.data && 'items' in allocation.data ? (allocation.data as PlanView) : null;

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={4}>Capacidade teórica</Title>
        <Text size="sm" c="dimmed">
          Dias úteis × horas por dia × fator de foco × dedicação, menos as ausências (Pessoas → Capacidade).
        </Text>
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Pessoa</Table.Th>
                <Table.Th className="num">Dias úteis</Table.Th>
                <Table.Th className="num">Ausências</Table.Th>
                <Table.Th className="num">Horas/dia</Table.Th>
                <Table.Th className="num">Fator de foco</Table.Th>
                <Table.Th className="num">Capacidade (h)</Table.Th>
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
        <Text size="sm">Total: {fmtNum(capacity.data?.total_hours)} h</Text>
      </Stack>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={4}>Distribuição teórica × real</Title>
          <Button onClick={() => create.mutate()} loading={create.isPending} variant={plan ? 'default' : 'filled'}>
            {plan ? 'Recalcular' : 'Calcular distribuição teórica'}
          </Button>
        </Group>
        {create.error && <ErrorState error={create.error} />}
        {plan ? <PlanResult view={plan} /> : <Text size="sm" c="dimmed">Nenhuma distribuição calculada para esta sprint.</Text>}
      </Stack>
      <SimulationPanel sprintId={sprintId} people={people} />
    </Stack>
  );
}
