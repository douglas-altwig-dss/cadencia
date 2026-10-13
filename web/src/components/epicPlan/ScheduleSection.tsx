import { Group, Stack, Tabs, Text } from '@mantine/core';
import { useState } from 'react';

import type { EpicPlanView, PlanWeek } from '../../api/types';
import { fmtNum } from '../../lib/format';
import { Note } from '../common';
import { PlanReadiness } from './PlanReadiness';
import type { TaskFocus } from './TaskCards';
import { InfoTip, plural, roleIndex, TIPS } from './shared';
import { WeeklyGantt, type GanttBar, type GanttGroup } from './WeeklyGantt';

/** "Semanas -2 e -1: planejamento — trabalham PM/PO e Arquiteto", read off the schedule. */
export function planningWeeksText(weeks: PlanWeek[]): string | null {
  const planning = weeks.filter((w) => w.planejamento);
  if (!planning.length) return null;
  const labels = planning.map((w) => String(w.semana));
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}` : labels[0];
  const roles = [...new Set(planning.flatMap((w) => w.papeis))];
  return `${labels.length > 1 ? 'Semanas' : 'Semana'} ${list}: planejamento${roles.length ? ` — trabalham ${roles.join(', ')}` : ''}`;
}

export function ScheduleHeader({ view, duration, weeks }: { view: EpicPlanView; duration: string; weeks: PlanWeek[] }) {
  const params = view.parametros;
  const planning = planningWeeksText(weeks);
  return (
    <Group gap="lg" wrap="wrap">
      <Text size="sm">
        <b>{fmtNum(params.horas_semana)}h úteis/semana</b> (5 dias × {fmtNum(params.jornada_h)}h, segunda a sexta)
      </Text>
      <Text size="sm">
        <b>Duração total:</b> {duration}
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
  const [tab, setTab] = useState<string | null>('tarefa');
  const base = view.base;
  if (!base) return <PlanReadiness view={view} onGo={onGo} title="Ainda não há cronograma base" />;
  const roles = roleIndex(view);
  const subtasks = new Map(view.subtarefas.map((s) => [s.id, s]));
  const tasks = new Map(view.tarefas.map((t) => [t.id, t]));
  const used = view.papeis.filter((r) => base.alocacoes.some((a) => a.papel_id === r.id));
  const lanes = (roleId: number) => [{ id: `r${roleId}`, label: <Text size="xs" c="dimmed">1 pessoa (referência)</Text> }];

  const bySubtask: GanttGroup[] = used.map((role) => ({
    id: `s${role.id}`,
    label: role.nome,
    color: role.cor,
    count: plural(base.alocacoes.filter((a) => a.papel_id === role.id).length, 'subtarefa', 'subtarefas'),
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
    count: plural(new Set(base.segmentos_tarefa.filter((s) => s.papel_id === role.id).map((s) => s.tarefa_id)).size, 'tarefa', 'tarefas'),
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
          Cronograma base
        </Text>
        <InfoTip label={TIPS.baseline} />
      </Group>
      <ScheduleHeader view={view} duration={base.duracao.rotulo} weeks={base.semanas} />
      <Tabs value={tab} onChange={setTab} variant="pills">
        <Tabs.List mb="sm">
          <Tabs.Tab value="tarefa">Por tarefa</Tabs.Tab>
          <Tabs.Tab value="subtarefa">Por subtarefa</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tarefa">
          <WeeklyGantt
            groups={byTask}
            bars={taskBars}
            weeks={base.semanas}
            workday={view.parametros.jornada_h}
            caption="Cronograma base por tarefa"
          />
        </Tabs.Panel>
        <Tabs.Panel value="subtarefa">
          <WeeklyGantt
            groups={bySubtask}
            bars={subtaskBars}
            weeks={base.semanas}
            workday={view.parametros.jornada_h}
            caption="Cronograma base por subtarefa"
          />
        </Tabs.Panel>
      </Tabs>
      <Note>
        As duas abas usam o mesmo cronograma base — uma pessoa por papel — e por isso a duração total é sempre a mesma. Em{' '}
        <b>Por tarefa</b>, uma tarefa com subtarefas de mais de um papel aparece numa barra em cada linha de papel envolvido, e
        cada barra só tem as horas daquele papel; subtarefas compostas (“A + B”) somam a hora cheia em cada barra. Se há um vão
        de tempo entre as subtarefas de um papel na mesma tarefa, a barra é dividida em partes em vez de esticar por cima do vão,
        para que o comprimento mostre tempo trabalhado. Clique numa barra para ver a tarefa e as subtarefas daquele intervalo.
      </Note>
    </Stack>
  );
}
