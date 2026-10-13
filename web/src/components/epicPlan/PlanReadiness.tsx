import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { useSavePlanParameters } from '../../api/planHooks';
import type { EpicPlanView, HoursSource } from '../../api/types';
import { plural } from './shared';

const SOURCE_LABEL: Record<HoursSource, string> = {
  estimativa_original: 'estimativa original',
  campo_estimativa: 'campo de estimativa',
};
/** "na estimativa original" / "no campo de estimativa": the article follows the noun. */
const IN_SOURCE: Record<HoursSource, string> = {
  estimativa_original: 'na estimativa original',
  campo_estimativa: 'no campo de estimativa',
};

type State = 'ok' | 'warn' | 'missing';

function Step({ state, title, children, action }: { state: State; title: string; children: ReactNode; action?: ReactNode }) {
  const icon = state === 'ok' ? <IconCheck size={16} /> : state === 'warn' ? <IconAlertTriangle size={16} /> : <IconX size={16} />;
  const color = state === 'ok' ? 'teal' : state === 'warn' ? 'yellow' : 'red';
  const word = state === 'ok' ? 'pronto' : state === 'warn' ? 'atenção' : 'falta';
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
        onSuccess: () => notifications.show({ title: 'Fonte das horas alterada', message: `As horas agora vêm ${other === 'campo_estimativa' ? 'do' : 'da'} ${SOURCE_LABEL[other]}.` }),
        onError: (error) => notifications.show({ color: 'red', title: 'Não foi possível alterar', message: error.message }),
      },
    );

  return (
    <Paper withBorder p="lg">
      <Text fw={700} mb={4}>
        {title ?? 'O que falta para montar o cronograma'}
      </Text>
      <Text size="sm" c="dimmed" mb="md">
        O cronograma precisa de horas e de um papel em cada subtarefa, e de pessoas que cubram esses papéis.
      </Text>
      <Stack gap="md">
        <Step
          state={hoursState}
          title="Horas das subtarefas"
          action={
            hoursState !== 'ok' && foundOther > found ? (
              <Button size="xs" onClick={switchSource} loading={save.isPending}>
                Usar {other === 'campo_estimativa' ? 'o' : 'a'} {SOURCE_LABEL[other]}
              </Button>
            ) : undefined
          }
        >
          {total === 0
            ? 'O épico não tem subtarefas coletadas.'
            : `${found} de ${plural(total, 'subtarefa', 'subtarefas')} têm horas ${IN_SOURCE[d.fonte_horas]} do Jira.`}
          {hoursState !== 'ok' && foundOther > found && ` ${other === 'campo_estimativa' ? 'O' : 'A'} ${SOURCE_LABEL[other]} tem valor em ${foundOther}.`}
        </Step>
        <Step
          state={d.sem_papel.length === 0 && total > 0 ? 'ok' : 'missing'}
          title="Papel de cada subtarefa"
          action={
            d.sem_papel.length > 0 ? (
              <Button size="xs" variant="default" onClick={() => onGo('plano-subtarefas')}>
                Atribuir papéis
              </Button>
            ) : undefined
          }
        >
          {d.sem_papel.length === 0
            ? `Todas têm papel: ${d.papel_por_origem.rotulo} por label, ${d.papel_por_origem.responsavel} pelo responsável, ${d.papel_por_origem.tarefa} pela tarefa, ${d.papel_por_origem.manual} escolhidos aqui.`
            : `${plural(d.sem_papel.length, 'subtarefa não tem', 'subtarefas não têm')} papel. Atribuir a função de cada pessoa (em Pessoas) resolve as que têm responsável; as demais se escolhem aqui.`}
        </Step>
        <Step
          state={d.membros_com_papel === 0 ? 'missing' : teamGap.length ? 'missing' : 'ok'}
          title="Equipe com papéis"
          action={
            d.membros_com_papel === 0 || teamGap.length ? (
              <Button size="xs" variant="default" component={Link} to="/pessoas?funcoes=1">
                Cadastrar funções em Pessoas
              </Button>
            ) : undefined
          }
        >
          {d.membros_com_papel === 0
            ? 'Ninguém tem papel ainda. As pessoas já vieram do Jira; falta dizer o papel de cada uma.'
            : teamGap.length
              ? teamGap.map((p) => p.mensagem).join(' ')
              : `${plural(d.membros_com_papel, 'pessoa', 'pessoas')} com papel; ${plural(view.selecao.length, 'selecionada', 'selecionadas')} para este épico.`}
        </Step>
        {cycles.length > 0 && (
          <Step state="missing" title="Dependências sem ciclo">
            {cycles.map((p) => p.mensagem).join(' ')}
          </Step>
        )}
      </Stack>
    </Paper>
  );
}
