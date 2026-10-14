import { Group, Stack, Tabs, Text } from '@mantine/core';
import { useState } from 'react';

import type { EpicPlanView, PlanWeek } from '../../api/types';
import { t as messages, useT } from '../../i18n';
import { fmtNum } from '../../lib/format';
import { Note } from '../common';
import { PlanReadiness } from './PlanReadiness';
import type { TaskFocus } from './TaskCards';
import { InfoTip, rich, roleIndex } from './shared';
import { WeeklyGantt, type GanttBar, type GanttGroup } from './WeeklyGantt';

/** "Semanas -2 e -1: planejamento — trabalham PM/PO e Arquiteto", read off the schedule. */
export function planningWeeksText(weeks: PlanWeek[]): string | null {
  const planning = weeks.filter((w) => w.planejamento);
  if (!planning.length) return null;
  const labels = planning.map((w) => String(w.semana));
  const roles = [...new Set(planning.flatMap((w) => w.papeis))];
  return messages().epicPlan.schedule.planningWeeks(labels, roles);
}

export function ScheduleHeader({ view, duration, weeks }: { view: EpicPlanView; duration: string; weeks: PlanWeek[] }) {
  const t = useT();
  const m = t.epicPlan.schedule;
  const params = view.parametros;
  const planning = planningWeeksText(weeks);
  return (
    <Group gap="lg" wrap="wrap">
      <Text size="sm">
        {rich(m.hoursPerWeek(fmtNum(params.horas_semana), fmtNum(params.jornada_h)))}
      </Text>
      <Text size="sm">
        {rich(m.totalDuration(duration))}
      </Text>
      {planning && <Text size="sm">{planning}</Text>}
    </Group>
  );
}

export function ScheduleSection({
  view,
  onOpen,
  onGo,
}: {
  view: EpicPlanView;
  onOpen: (focus: TaskFocus) => void;
  onGo: (id: string) => void;
}) {
  const t = useT();
  const m = t.epicPlan.schedule;
  const count = t.epicPlan.count;
  const [tab, setTab] = useState<string | null>('task');
  const base = view.base;
  if (!base) return <PlanReadiness view={view} onGo={onGo} title={m.noBaseline} />;
  const roles = roleIndex(view);
  const subtasks = new Map(view.subtarefas.map((s) => [s.id, s]));
  const tasks = new Map(view.tarefas.map((t) => [t.id, t]));
  const used = view.papeis.filter((r) => base.alocacoes.some((a) => a.papel_id === r.id));
  const lanes = (roleId: number) => [{ id: `r${roleId}`, label: <Text size="xs" c="dimmed">{m.reference}</Text> }];

  const bySubtask: GanttGroup[] = used.map((role) => ({
    id: `s${role.id}`,
    label: role.nome,
    color: role.cor,
    count: count.subtasks(base.alocacoes.filter((a) => a.papel_id === role.id).length),
    lanes: lanes(role.id),
  }));
  const subtaskBars: GanttBar[] = base.alocacoes
    .filter((a) => a.fim > a.inicio)
    .map((a) => {
      const subtask = subtasks.get(a.subtarefa_id);
      const title = subtask?.titulo ?? a.subtarefa_id;
      return {
        key: `${a.subtarefa_id}-${a.papel_id}`,
        lane: `r${a.papel_id}`,
        start: a.inicio,
        end: a.fim,
        title,
        detail: subtask?.rotulo_horas,
        color: roles.get(a.papel_id)?.cor ?? '#868e96',
        label: `${a.subtarefa_id} ${title}, ${subtask?.rotulo_horas ?? ''}`,
        tooltip: `${a.subtarefa_id} · ${title} — ${subtask?.rotulo_horas ?? ''}`,
        onClick: subtask ? () => onOpen({ taskId: subtask.tarefa_id, subtasks: [subtask.id] }) : undefined,
      };
    });

  const byTask: GanttGroup[] = used.map((role) => ({
    id: `t${role.id}`,
    label: role.nome,
    color: role.cor,
    count: count.tasks(new Set(base.segmentos_tarefa.filter((s) => s.papel_id === role.id).map((s) => s.tarefa_id)).size),
    lanes: lanes(role.id),
  }));
  const taskBars: GanttBar[] = base.segmentos_tarefa.map((segment) => {
    const title = tasks.get(segment.tarefa_id)?.titulo ?? segment.tarefa_id;
    return {
      key: `${segment.tarefa_id}-${segment.papel_id}-${segment.inicio}`,
      lane: `r${segment.papel_id}`,
      start: segment.inicio,
      end: segment.fim,
      title,
      detail: segment.rotulo,
      color: roles.get(segment.papel_id)?.cor ?? '#868e96',
      label: `${title}, ${segment.rotulo}`,
      tooltip: `${title} — ${segment.rotulo} (${segment.subtarefas.join(', ')})`,
      onClick: () => onOpen({ taskId: segment.tarefa_id, subtasks: segment.subtarefas }),
    };
  });

  return (
    <Stack gap="sm">
      <Group gap={6}>
        <Text size="sm" c="dimmed">
          {m.baseline}
        </Text>
        <InfoTip label={t.epicPlan.tips.baseline} />
      </Group>
      <ScheduleHeader view={view} duration={base.duracao.rotulo} weeks={base.semanas} />
      <Tabs value={tab} onChange={setTab} variant="pills">
        <Tabs.List mb="sm">
          <Tabs.Tab value="task">{m.byTask}</Tabs.Tab>
          <Tabs.Tab value="subtask">{m.bySubtask}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="task">
          <WeeklyGantt
            groups={byTask}
            bars={taskBars}
            weeks={base.semanas}
            workday={view.parametros.jornada_h}
            caption={m.byTaskCaption}
          />
        </Tabs.Panel>
        <Tabs.Panel value="subtask">
          <WeeklyGantt
            groups={bySubtask}
            bars={subtaskBars}
            weeks={base.semanas}
            workday={view.parametros.jornada_h}
            caption={m.bySubtaskCaption}
          />
        </Tabs.Panel>
      </Tabs>
      <Note>{rich(m.note)}</Note>
    </Stack>
  );
}
