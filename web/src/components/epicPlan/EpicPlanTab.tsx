import { Alert, Box, Grid, NavLink, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { plural } from '../../lib/format';
import { useEpicPlan } from '../../api/planHooks';
import type { PlanProblem } from '../../api/types';
import { Empty, ErrorState, Loading } from '../common';
import { CapacitySection } from './CapacitySection';
import { EstimateSection } from './EstimateSection';
import { ParametersSummary } from './ParametersSummary';
import { PipelineSection } from './PipelineSection';
import { PlanningSection } from './PlanningSection';
import { PlanReadiness, planReady } from './PlanReadiness';
import { PlanSummary } from './PlanSummary';
import { ScheduleSection } from './ScheduleSection';
import { SubtaskRolesPanel } from './SubtaskRolesPanel';
import { PlanSection } from './shared';
import { TaskCards, TaskModal, type TaskFocus } from './TaskCards';

// The answers first, the configuration that produces them last.
const INDEX = [
  {
    group: 'Plano',
    items: [
      ['plano-resumo', 'Resumo'],
      ['plano-capacidade', 'Disponibilidade de horas'],
      ['plano-estimativa', 'Estimativa por papel'],
      ['plano-pipeline', 'Pipeline de dependências'],
      ['plano-cronograma', 'Cronograma semanal'],
      ['plano-planejamento', 'Planejamento'],
      ['plano-cards', 'Cards detalhados'],
    ],
  },
  {
    group: 'Configuração',
    items: [
      ['plano-subtarefas', 'Papéis das subtarefas'],
      ['plano-dados', 'Dados do Jira'],
      ['plano-parametros', 'Parâmetros'],
    ],
  },
] as const;

const IDS = INDEX.flatMap((g) => g.items.map(([id]) => id));

/** The same index for a screen too narrow for the side one: a jump list, grouped the same way. */
const JUMP = INDEX.map((g) => ({ group: g.group, items: g.items.map(([id, label]) => ({ value: id, label })) }));

/** The section being read: the last one whose top has passed under the header. */
function useActiveSection(ready: boolean) {
  const [active, setActive] = useState<string>(IDS[0]);
  useEffect(() => {
    if (!ready) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = IDS.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    for (const id of IDS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ready]);
  return active;
}

function Problems({ problems }: { problems: PlanProblem[] }) {
  if (!problems.length) {
    return (
      <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />} title="Nenhum problema nos dados do épico">
        Todas as subtarefas têm papel e estimativa, e as dependências formam um fluxo sem ciclos.
      </Alert>
    );
  }
  const errors = problems.filter((p) => p.nivel === 'erro');
  const warnings = problems.filter((p) => p.nivel === 'aviso');
  return (
    <Stack gap="xs">
      {errors.length > 0 && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={`${errors.length === 1 ? '1 erro impede' : `${errors.length} erros impedem`} o cronograma e o planejamento`}>
          {errors.map((p) => (
            <Text size="sm" key={p.codigo + p.mensagem}>
              {p.mensagem}
            </Text>
          ))}
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />} title={plural(warnings.length, 'aviso', 'avisos')}>
          {warnings.map((p) => (
            <Text size="sm" key={p.codigo + p.mensagem}>
              {p.mensagem}
            </Text>
          ))}
        </Alert>
      )}
    </Stack>
  );
}

/**
 * The epic plan: roles, capacity, hours per role, dependencies, the baseline schedule, the
 * generated plan and the task cards — every number from ``GET /epics/{key}/plano``.
 */
export function EpicPlanTab({ epicKey }: { epicKey: string }) {
  const plan = useEpicPlan(epicKey);
  const [focus, setFocus] = useState<TaskFocus | null>(null);
  const active = useActiveSection(!!plan.data);
  if (plan.isLoading) return <Loading rows={8} />;
  if (plan.error) return <ErrorState error={plan.error} />;
  const view = plan.data;
  if (!view) return null;

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <Grid gap="xl">
      <Grid.Col span={{ base: 12, lg: 2 }} visibleFrom="lg">
        <Box component="nav" aria-label="Índice do plano" className="plan-index">
          {INDEX.map((group) => (
            <Box key={group.group} mb="md">
              <Text className="kpi-label" mb={6} px={8}>
                {group.group}
              </Text>
              {group.items.map(([id, label]) => (
                <NavLink
                  key={id}
                  href={`#${id}`}
                  label={label}
                  active={active === id}
                  aria-current={active === id ? 'location' : undefined}
                  className="plan-index-link"
                  onClick={(event) => {
                    event.preventDefault();
                    go(id);
                  }}
                />
              ))}
            </Box>
          ))}
        </Box>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 10 }}>
        <Box hiddenFrom="lg" className="plan-jump">
          <Select
            label="Ir para a seção"
            data={JUMP}
            value={active}
            onChange={(id) => id && go(id)}
            allowDeselect={false}
            aria-label="Ir para a seção do plano"
          />
        </Box>
        {view.tarefas.length === 0 && (
          <Box mb="lg">
            <Empty title="Este épico não tem tarefas coletadas.">
              O plano lê as tarefas filhas do épico e as subtarefas delas, com as horas da fonte escolhida nos parâmetros (estimativa
              original ou campo de estimativa).
            </Empty>
          </Box>
        )}
        <PlanSection id="plano-resumo" title="Resumo" description="Quanto o épico custa, quanto dura e quanto o planejamento ganha sobre uma pessoa por papel.">
          <Stack gap="md">
            {!planReady(view) && <PlanReadiness view={view} onGo={go} />}
            <PlanSummary view={view} />
          </Stack>
        </PlanSection>
        <PlanSection
          id="plano-capacidade"
          title="Disponibilidade de horas"
          description="Quem está disponível para este épico e quanto cada papel poderia receber."
        >
          <CapacitySection view={view} />
        </PlanSection>
        <PlanSection id="plano-estimativa" title="Estimativa de horas por papel" description="Horas de planejamento e execução, overheads e o peso de cada papel.">
          <EstimateSection view={view} />
        </PlanSection>
        <PlanSection id="plano-pipeline" title="Pipeline de dependências" description="O que bloqueia o quê, da esquerda para a direita.">
          <PipelineSection view={view} onOpen={setFocus} />
        </PlanSection>
        <PlanSection id="plano-cronograma" title="Cronograma semanal" description="O cronograma base: uma pessoa por papel, sem otimizar a alocação.">
          <ScheduleSection view={view} onOpen={setFocus} onGo={go} />
        </PlanSection>
        <PlanSection id="plano-planejamento" title="Planejamento" description="A equipe real, alocada por um algoritmo, contra o cronograma base.">
          <PlanningSection view={view} onOpen={setFocus} onGo={go} />
        </PlanSection>
        <PlanSection id="plano-cards" title="Cards detalhados" description="Cada tarefa com seu contexto de negócio, técnico e as subtarefas.">
          <TaskCards view={view} />
        </PlanSection>
        <PlanSection
          id="plano-subtarefas"
          title="Papéis das subtarefas"
          description="De onde veio o papel de cada subtarefa, e a escolha manual quando nada no Jira responde."
        >
          <SubtaskRolesPanel view={view} />
        </PlanSection>
        <PlanSection id="plano-dados" title="Dados do Jira" description="O que a leitura do épico encontrou de estranho.">
          <Problems problems={view.problemas} />
        </PlanSection>
        <PlanSection id="plano-parametros" title="Parâmetros" description="Jornada, overheads, granularidade e como as labels do Jira viram plano — vale para todos os épicos, e se edita em Configuração.">
          <ParametersSummary parameters={view.parametros} />
        </PlanSection>
        <TaskModal view={view} focus={focus} onClose={() => setFocus(null)} />
      </Grid.Col>
    </Grid>
  );
}
