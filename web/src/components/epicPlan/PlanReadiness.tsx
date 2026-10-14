import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { useSavePlanParameters } from '../../api/planHooks';
import type { EpicPlanView, HoursSource } from '../../api/types';
import { useT } from '../../i18n';

type State = 'ok' | 'warn' | 'missing';

function Step({ state, title, children, action }: { state: State; title: string; children: ReactNode; action?: ReactNode }) {
  const t = useT();
  const icon = state === 'ok' ? <IconCheck size={16} /> : state === 'warn' ? <IconAlertTriangle size={16} /> : <IconX size={16} />;
  const color = state === 'ok' ? 'teal' : state === 'warn' ? 'yellow' : 'red';
  const word = t.epicPlan.readiness.state[state];
  return (
    <Group wrap="nowrap" align="flex-start" gap="sm">
      <ThemeIcon color={color} variant="light" radius="xl" size={28} aria-label={word}>
        {icon}
      </ThemeIcon>
      <Stack gap={2} style={{ flex: 1 }}>
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Text size="sm" c="dimmed" component="div">
          {children}
        </Text>
      </Stack>
      {action}
    </Group>
  );
}

/** Whether the epic can be scheduled, and if not, exactly what is missing and the one step that
 *  fixes each thing — shown where the Gantt would be, instead of a wall of per-subtask errors. */
export function planReady(view: EpicPlanView): boolean {
  const d = view.diagnostico;
  return !!view.base && !!view.plano && d.horas_encontradas[d.fonte_horas] === d.subtarefas && d.subtarefas > 0;
}

export function PlanReadiness({ view, onGo, title }: { view: EpicPlanView; onGo: (id: string) => void; title?: string }) {
  const t = useT();
  const m = t.epicPlan.readiness;
  const save = useSavePlanParameters();
  const d = view.diagnostico;
  const total = d.subtarefas;
  const other: HoursSource = d.fonte_horas === 'estimativa_original' ? 'campo_estimativa' : 'estimativa_original';
  const found = d.horas_encontradas[d.fonte_horas];
  const foundOther = d.horas_encontradas[other];
  const hoursState: State = total === 0 ? 'missing' : found === total ? 'ok' : found === 0 ? 'missing' : 'warn';
  const teamGap = view.bloqueios_plano.filter((p) => p.codigo === 'papel_sem_membro' || p.codigo === 'composta_sem_par');
  const cycles = view.bloqueios_base.filter((p) => p.codigo === 'ciclo');
  const switchSource = () =>
    save.mutate(
      { fonte_horas: other },
      {
        onSuccess: () => notifications.show({ title: m.switched, message: m.switchedTo[other] }),
        onError: (error) => notifications.show({ color: 'red', title: m.switchFailed, message: error.message }),
      },
    );

  return (
    <Paper withBorder p="lg">
      <Text fw={700} mb={4}>
        {title ?? m.title}
      </Text>
      <Text size="sm" c="dimmed" mb="md">
        {m.intro}
      </Text>
      <Stack gap="md">
        <Step
          state={hoursState}
          title={m.hoursStep}
          action={
            hoursState !== 'ok' && foundOther > found ? (
              <Button size="xs" onClick={switchSource} loading={save.isPending}>
                {m.use[other]}
              </Button>
            ) : undefined
          }
        >
          {total === 0
            ? m.noSubtasks
            : m.hoursFound(found, total, d.fonte_horas === 'campo_estimativa')}
          {hoursState !== 'ok' && foundOther > found && m.otherHas(other === 'campo_estimativa', foundOther)}
        </Step>
        <Step
          state={d.sem_papel.length === 0 && total > 0 ? 'ok' : 'missing'}
          title={m.roleStep}
          action={
            d.sem_papel.length > 0 ? (
              <Button size="xs" variant="default" onClick={() => onGo('plano-subtarefas')}>
                {m.assignRoles}
              </Button>
            ) : undefined
          }
        >
          {d.sem_papel.length === 0
            ? m.allHaveRole(d.papel_por_origem.rotulo, d.papel_por_origem.responsavel, d.papel_por_origem.tarefa, d.papel_por_origem.manual)
            : m.missingRole(d.sem_papel.length)}
        </Step>
        <Step
          state={d.membros_com_papel === 0 ? 'missing' : teamGap.length ? 'missing' : 'ok'}
          title={m.teamStep}
          action={
            d.membros_com_papel === 0 || teamGap.length ? (
              <Button size="xs" variant="default" component={Link} to="/people?roles=1">
                {m.registerRoles}
              </Button>
            ) : undefined
          }
        >
          {d.membros_com_papel === 0
            ? m.nobodyRole
            : teamGap.length
              ? teamGap.map((p) => p.mensagem).join(' ')
              : m.teamOk(d.membros_com_papel, view.selecao.length)}
        </Step>
        {cycles.length > 0 && (
          <Step state="missing" title={m.cyclesStep}>
            {cycles.map((p) => p.mensagem).join(' ')}
          </Step>
        )}
      </Stack>
    </Paper>
  );
}
