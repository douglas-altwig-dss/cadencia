import { Alert, Box, Grid, NavLink, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { useT } from '../../i18n';
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

// The answers first, the configuration that produces them last. Labels come from the catalogue.
const INDEX = [
  {
    group: 'plan',
    items: ['plano-resumo', 'plano-capacidade', 'plano-estimativa', 'plano-pipeline', 'plano-cronograma', 'plano-planejamento', 'plano-cards'],
  },
  { group: 'config', items: ['plano-subtarefas', 'plano-dados', 'plano-parametros'] },
] as const;

const IDS = INDEX.flatMap((g) => [...g.items]);

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
  const t = useT();
  if (!problems.length) {
    return (
      <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />} title={t.epicPlan.tab.noProblemsTitle}>
        {t.epicPlan.tab.noProblemsBody}
      </Alert>
    );
  }
  const errors = problems.filter((p) => p.nivel === 'erro');
  const warnings = problems.filter((p) => p.nivel === 'aviso');
  return (
    <Stack gap="xs">
      {errors.length > 0 && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={t.epicPlan.tab.errorsTitle(errors.length)}>
          {errors.map((p) => (
            <Text size="sm" key={p.codigo + p.mensagem}>
              {p.mensagem}
            </Text>
          ))}
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={18} />} title={t.epicPlan.count.warnings(warnings.length)}>
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
 * generated plan and the task cards — every number from ``GET /epics/{key}/plan``.
 */
export function EpicPlanTab({ epicKey }: { epicKey: string }) {
  const t = useT();
  const plan = useEpicPlan(epicKey);
  const [focus, setFocus] = useState<TaskFocus | null>(null);
  const active = useActiveSection(!!plan.data);
  if (plan.isLoading) return <Loading rows={8} />;
  if (plan.error) return <ErrorState error={plan.error} />;
  const view = plan.data;
  if (!view) return null;

  const tab = t.epicPlan.tab;
  const sections = tab.sections;
  const groupLabel = (group: (typeof INDEX)[number]['group']) => (group === 'plan' ? tab.groupPlan : tab.groupConfig);
  /** The same index for a screen too narrow for the side one: a jump list, grouped the same way. */
  const jump = INDEX.map((g) => ({ group: groupLabel(g.group), items: g.items.map((id) => ({ value: id, label: tab.index[id] })) }));
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <Grid gap="xl">
      <Grid.Col span={{ base: 12, lg: 2 }} visibleFrom="lg">
        <Box component="nav" aria-label={tab.indexAria} className="plan-index">
          {INDEX.map((group) => (
            <Box key={group.group} mb="md">
              <Text className="kpi-label" mb={6} px={8}>
                {groupLabel(group.group)}
              </Text>
              {group.items.map((id) => (
                <NavLink
                  key={id}
                  href={`#${id}`}
                  label={tab.index[id]}
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
            label={tab.jump}
            data={jump}
            value={active}
            onChange={(id) => id && go(id)}
            allowDeselect={false}
            aria-label={tab.jumpAria}
          />
        </Box>
        {view.tarefas.length === 0 && (
          <Box mb="lg">
            <Empty title={tab.emptyTitle}>{tab.emptyBody}</Empty>
          </Box>
        )}
        <PlanSection id="plano-resumo" title={sections.summary.title} description={sections.summary.description}>
          <Stack gap="md">
            {!planReady(view) && <PlanReadiness view={view} onGo={go} />}
            <PlanSummary view={view} />
          </Stack>
        </PlanSection>
        <PlanSection id="plano-capacidade" title={sections.capacity.title} description={sections.capacity.description}>
          <CapacitySection view={view} />
        </PlanSection>
        <PlanSection id="plano-estimativa" title={sections.estimate.title} description={sections.estimate.description}>
          <EstimateSection view={view} />
        </PlanSection>
        <PlanSection id="plano-pipeline" title={sections.pipeline.title} description={sections.pipeline.description}>
          <PipelineSection view={view} onOpen={setFocus} />
        </PlanSection>
        <PlanSection id="plano-cronograma" title={sections.schedule.title} description={sections.schedule.description}>
          <ScheduleSection view={view} onOpen={setFocus} onGo={go} />
        </PlanSection>
        <PlanSection id="plano-planejamento" title={sections.planning.title} description={sections.planning.description}>
          <PlanningSection view={view} onOpen={setFocus} onGo={go} />
        </PlanSection>
        <PlanSection id="plano-cards" title={sections.cards.title} description={sections.cards.description}>
          <TaskCards view={view} />
        </PlanSection>
        <PlanSection id="plano-subtarefas" title={sections.subtasks.title} description={sections.subtasks.description}>
          <SubtaskRolesPanel view={view} />
        </PlanSection>
        <PlanSection id="plano-dados" title={sections.data.title} description={sections.data.description}>
          <Problems problems={view.problemas} />
        </PlanSection>
        <PlanSection id="plano-parametros" title={sections.parameters.title} description={sections.parameters.description}>
          <ParametersSummary parameters={view.parametros} />
        </PlanSection>
        <TaskModal view={view} focus={focus} onClose={() => setFocus(null)} />
      </Grid.Col>
    </Grid>
  );
}
