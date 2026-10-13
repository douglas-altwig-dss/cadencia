import { Alert, Button, Grid, Group, Paper, Radio, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';

import { ApiError } from '../../api/client';
import { useAlgorithms, useGeneratePlan } from '../../api/planHooks';
import type { EpicPlanView, PlanResult } from '../../api/types';
import { collator } from '../../i18n';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { Note } from '../common';
import { MemberSelection } from './MemberSelection';
import { PlanReadiness } from './PlanReadiness';
import { ScheduleHeader } from './ScheduleSection';
import { gainText, InfoTip, plural, roleIndex, StatusBadge, TIPS } from './shared';
import type { TaskFocus } from './TaskCards';
import { WeeklyGantt, type GanttBar, type GanttGroup } from './WeeklyGantt';

function Outcome({ result }: { result: PlanResult }) {
  if (result.status === 'sem_solucao') {
    return (
      <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Sem solução no limite de tempo">
        O algoritmo não encontrou um plano em {fmtNum(result.tempo_s)} s. O plano anterior foi mantido; aumente o limite de tempo nos
        parâmetros ou use outro algoritmo.
      </Alert>
    );
  }
  if (result.status === 'invalido') {
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="O plano devolvido não passou na validação">
        {result.violacoes.slice(0, 8).map((v) => (
          <Text size="sm" key={v}>
            {v}
          </Text>
        ))}
        <Text size="sm" mt={4}>
          Ele foi descartado; o plano anterior foi mantido.
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
          count: plural(plan.alocacoes.filter((a) => a.papel_id === role.id).length, 'subtarefa', 'subtarefas'),
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
              <Radio.Group value={algorithm} onChange={setChosen} label="Algoritmo" labelProps={{ mb: 'xs' }}>
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
                            {a.exato ? `exato, até ${fmtNum(limit)} s` : 'responde na hora'}
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
                  Gerar plano
                </Button>
                {generate.isPending && current?.exato && (
                  <Text size="sm" c="dimmed">
                    Resolvendo… até {fmtNum(limit)} s.
                  </Text>
                )}
              </Group>
              {error && (
                <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={error.reason}>
                  {error.message}
                  {error.action && <Text size="sm">{error.action}</Text>}
                  <Text size="sm" mt={4}>
                    O plano anterior foi mantido; o algoritmo guloso continua disponível.
                  </Text>
                </Alert>
              )}
              {generate.data && <Outcome result={generate.data} />}
              {plan && base && (
                <Stack gap="xs">
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Text className="kpi-label">Plano gerado</Text>
                      <Text className="kpi-value">{plural(plan.duracao.total_dias, 'dia', 'dias')}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {plan.algoritmo_nome}
                      </Text>
                    </Paper>
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Group gap={4}>
                        <Text className="kpi-label">Cronograma base</Text>
                        <InfoTip label={TIPS.baseline} width={260} />
                      </Group>
                      <Text className="kpi-value">{plural(base.duracao.total_dias, 'dia', 'dias')}</Text>
                      <Text size="xs" c="dimmed">
                        1 pessoa por papel
                      </Text>
                    </Paper>
                    <Paper p="sm" radius="md" bg="var(--surface-sunken)">
                      <Text className="kpi-label">Ganho</Text>
                      <Text className="kpi-value" c={gain?.good ? 'teal.8' : undefined}>
                        {plan.ganho_dias !== undefined ? `${plan.ganho_dias > 0 ? '−' : plan.ganho_dias < 0 ? '+' : ''}${plural(Math.abs(plan.ganho_dias), 'dia', 'dias')}` : '—'}
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
                        ? `Gerado em ${fmtDateTime(plan.gerado_em)}${plan.status === 'heuristico' ? '' : `, resolvido em ${plan.tempo_s < 0.1 ? 'menos de 0,1' : fmtNum(plan.tempo_s, 1)} s`}.`
                        : 'Plano guloso calculado na hora para a seleção atual. Use “Gerar plano” para registrá-lo como o último plano.'}
                    </Text>
                  </Group>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      {!plan && <PlanReadiness view={view} onGo={onGo} title="Ainda não há plano para esta equipe" />}

      {plan && (
        <>
          <ScheduleHeader view={view} duration={plan.duracao.rotulo} weeks={plan.semanas} />
          <WeeklyGantt groups={groups} bars={bars} weeks={plan.semanas} workday={view.parametros.jornada_h} caption="Plano gerado por papel e membro" />
          <Note>
            Cada subtarefa é alocada a um especialista disponível — considerando quem cobre mais de um papel — respeitando sempre os
            pré-requisitos. Subtarefas compostas (“A + B”) reservam duas pessoas diferentes ao mesmo tempo. Um membro com vários
            papéis aparece em cada grupo, mas cada subtarefa só aparece na linha do papel em que foi alocada. O ganho de tempo vem de
            rodar em paralelo subtarefas independentes do mesmo papel; cadeias que dependem umas das outras continuam sequenciais, não
            importa quantas pessoas estejam disponíveis.
          </Note>
        </>
      )}
      <Text size="xs" c="dimmed">
        Todos os algoritmos rodam no backend e todo plano passa pelo validador antes de ser mostrado. Se o solver de MILP ou CP-SAT
        estiver indisponível, essas opções mostram o erro e o guloso continua funcionando. Novas estratégias entram no seletor sem
        mudar esta tela.
      </Text>
    </Stack>
  );
}
