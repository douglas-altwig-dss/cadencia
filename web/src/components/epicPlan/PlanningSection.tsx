import { Alert, Button, Grid, Group, Paper, Radio, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';

import { ApiError } from '../../api/client';
import { useAlgorithms, useGeneratePlan } from '../../api/planHooks';
import type { EpicPlanView, PlanResult } from '../../api/types';
import { collator, useT } from '../../i18n';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { Note } from '../common';
import { MemberSelection } from './MemberSelection';
import { PlanReadiness } from './PlanReadiness';
import { ScheduleHeader } from './ScheduleSection';
import { gainText, InfoTip, roleIndex, StatusBadge } from './shared';
import type { TaskFocus } from './TaskCards';
import { WeeklyGantt, type GanttBar, type GanttGroup } from './WeeklyGantt';

function Outcome({ result }: { result: PlanResult }) {
  const t = useT();
  const m = t.epicPlan.planning;
  if (result.status === 'sem_solucao') {
    return (
      <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title={m.noSolutionTitle}>
        {m.noSolutionBody(fmtNum(result.tempo_s))}
      </Alert>
    );
  }
  if (result.status === 'invalido') {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={m.invalidTitle}>
        {result.violacoes.slice(0, 8).map((v) => (
          <Text size="sm" key={v}>
            {v}
          </Text>
        ))}
        <Text size="sm" mt={4}>
          {m.invalidKept}
        </Text>
      </Alert>
    );
  }
  return null;
}

export function PlanningSection({
  view,
  onOpen,
  onGo,
}: {
  view: EpicPlanView;
  onOpen: (focus: TaskFocus) => void;
  onGo: (id: string) => void;
}) {
  const t = useT();
  const m = t.epicPlan.planning;
  const algorithms = useAlgorithms();
  const generate = useGeneratePlan();
  const items = algorithms.data?.items ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const algorithm = chosen ?? items.find((a) => a.padrao)?.id ?? 'guloso';
  const current = items.find((a) => a.id === algorithm);
  const plan = view.plano;
  const base = view.base;
  const roles = roleIndex(view);
  const members = new Map(view.membros.map((m) => [m.id, m]));
  const subtasks = new Map(view.subtarefas.map((s) => [s.id, s]));
  const limit = view.parametros.limite_solver_s;

  const run = () =>
    generate.mutate({ epico: view.epico.key, algoritmo: algorithm, membros_ids: view.selecao, limite_tempo_s: limit });

  const groups: GanttGroup[] = plan
    ? view.papeis
        .filter((role) => view.subtarefas.some((s) => s.papeis.includes(role.id)))
        .map((role) => ({
          id: `p${role.id}`,
          label: role.nome,
          color: role.cor,
          count: t.epicPlan.count.subtasks(plan.alocacoes.filter((a) => a.papel_id === role.id).length),
          lanes: view.selecao
            .map((id) => members.get(id))
            .filter((m) => m && m.papeis.some((p) => p.papel_id === role.id))
            .sort((a, b) => collator().compare(a!.nome, b!.nome))
            .map((m) => ({ id: `${role.id}:${m!.id}`, label: <Text size="sm">— {m!.nome}</Text> })),
        }))
    : [];
  const bars: GanttBar[] = (plan?.alocacoes ?? [])
    .filter((a) => a.fim > a.inicio)
    .map((a) => {
      const subtask = subtasks.get(a.subtarefa_id);
      const title = subtask?.titulo ?? a.subtarefa_id;
      return {
        key: `${a.subtarefa_id}-${a.papel_id}`,
        lane: `${a.papel_id}:${a.membro_id}`,
        start: a.inicio,
        end: a.fim,
        title: a.subtarefa_id,
        color: roles.get(a.papel_id)?.cor ?? '#868e96',
        label: `${a.subtarefa_id} ${title}, ${members.get(a.membro_id)?.nome ?? a.membro_id}`,
        tooltip: `${a.subtarefa_id} · ${title} — ${subtask?.rotulo_horas ?? ''}`,
        onClick: subtask ? () => onOpen({ taskId: subtask.tarefa_id, subtasks: [subtask.id] }) : undefined,
      };
    });
  const gain = plan?.ganho_dias !== undefined ? gainText(plan.ganho_dias) : null;
  const error = generate.error instanceof ApiError ? generate.error : null;

  return (
    <Stack gap="md">
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" h="100%">
            <MemberSelection view={view} layout="list" />
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md" h="100%">
            <Stack gap="md">
              <Radio.Group value={algorithm} onChange={setChosen} label={m.algorithm} labelProps={{ mb: 'xs' }}>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                  {items.map((a) => (
                    <Radio.Card key={a.id} value={a.id} p="sm" radius="md" className="algo-card">
                      <Group wrap="nowrap" align="flex-start" gap="xs">
                        <Radio.Indicator mt={2} />
                        <Stack gap={4} style={{ flex: 1 }}>
                          <Group gap={4} wrap="nowrap" justify="space-between" align="flex-start">
                            <Text size="sm" fw={600} lh={1.3}>
                              {a.nome}
                            </Text>
                            <InfoTip label={a.descricao} width={300} nested />
                          </Group>
                          <Text size="xs" c="dimmed">
                            {a.exato ? m.exact(fmtNum(limit)) : m.instant}
                          </Text>
                        </Stack>
                      </Group>
                    </Radio.Card>
                  ))}
                </SimpleGrid>
              </Radio.Group>
              <Group>
                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={run}
                  loading={generate.isPending}
                  disabled={!view.selecao.length || view.bloqueios_plano.length > 0 || view.bloqueios_base.length > 0}
                >
                  {m.generate}
                </Button>
                {generate.isPending && current?.exato && (
                  <Text size="sm" c="dimmed">
                    {m.solving(fmtNum(limit))}
                  </Text>
                )}
              </Group>
              {error && (
                <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={error.reason}>
                  {error.message}
                  {error.action && <Text size="sm">{error.action}</Text>}
                  <Text size="sm" mt={4}>
                    {m.errorKept}
                  </Text>
                </Alert>
              )}
              {generate.data && <Outcome result={generate.data} />}
              {plan && base && (
                <Stack gap="xs">
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Text className="kpi-label">{m.generated}</Text>
                      <Text className="kpi-value">{t.epicPlan.count.days(plan.duracao.total_dias)}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {plan.algoritmo_nome}
                      </Text>
                    </Paper>
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Group gap={4}>
                        <Text className="kpi-label">{m.baseline}</Text>
                        <InfoTip label={t.epicPlan.tips.baseline} width={260} />
                      </Group>
                      <Text className="kpi-value">{t.epicPlan.count.days(base.duracao.total_dias)}</Text>
                      <Text size="xs" c="dimmed">
                        {m.onePerRole}
                      </Text>
                    </Paper>
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Text className="kpi-label">{m.gain}</Text>
                      <Text className="kpi-value" c={gain?.good ? 'teal.8' : undefined}>
                        {plan.ganho_dias !== undefined ? `${plan.ganho_dias > 0 ? '−' : plan.ganho_dias < 0 ? '+' : ''}${t.epicPlan.count.days(Math.abs(plan.ganho_dias))}` : '—'}
                      </Text>
                      <Text size="xs" c={gain?.good ? 'teal.8' : 'dimmed'} fw={gain?.good ? 600 : undefined}>
                        {gain?.text ?? ''}
                      </Text>
                    </Paper>
                  </SimpleGrid>
                  <Group gap="xs">
                    {plan.status !== 'heuristico' && <StatusBadge status={plan.status} gap={plan.gap} />}
                    <Text size="xs" c="dimmed">
                      {plan.origem === 'armazenado'
                        ? plan.status === 'heuristico'
                          ? m.generatedAt(fmtDateTime(plan.gerado_em))
                          : m.generatedAtSolved(fmtDateTime(plan.gerado_em), plan.tempo_s < 0.1 ? m.lessThanTenth : fmtNum(plan.tempo_s, 1))
                        : m.greedyNow}
                    </Text>
                  </Group>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      {!plan && <PlanReadiness view={view} onGo={onGo} title={m.noPlanTitle} />}

      {plan && (
        <>
          <ScheduleHeader view={view} duration={plan.duracao.rotulo} weeks={plan.semanas} />
          <WeeklyGantt groups={groups} bars={bars} weeks={plan.semanas} workday={view.parametros.jornada_h} caption={m.ganttCaption} />
          <Note>{m.note}</Note>
        </>
      )}
      <Text size="xs" c="dimmed">
        {m.footer}
      </Text>
    </Stack>
  );
}
