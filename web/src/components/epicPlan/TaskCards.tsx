import { Anchor, Badge, Box, Collapse, Group, Modal, Paper, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';

import type { EpicPlanView, PlanSubtask, PlanTask } from '../../api/types';
import { hours, RoleChip, roleIndex, type RoleIndex } from './shared';

const ORIGIN_WORD: Record<NonNullable<PlanSubtask['origem_papel']>, string> = {
  manual: 'escolha manual',
  rotulo: 'label do Jira',
  responsavel: 'responsável',
  tarefa: 'tarefa',
};

const KIND: Record<PlanSubtask['tipo'], string> = {
  execucao: 'execução',
  code_review: 'code review',
  cadastro_jira: 'cadastro no Jira',
};

function Stripes({ task, roles }: { task: PlanTask; roles: RoleIndex }) {
  const colors = task.papeis.map((id) => roles.get(id)?.cor).filter((c): c is string => !!c);
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', width: 8, flex: '0 0 8px' }} aria-hidden>
      {(colors.length ? colors : ['var(--mantine-color-default-border)']).map((color, i) => (
        <Box key={i} style={{ flex: 1, background: color }} />
      ))}
    </Box>
  );
}

function SubtaskRow({
  subtask,
  roles,
  view,
  open,
  highlighted,
  onToggle,
}: {
  subtask: PlanSubtask;
  roles: RoleIndex;
  view: EpicPlanView;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  const first = roles.get(subtask.papeis[0]);
  const titles = new Map(view.subtarefas.map((s) => [s.id, s.titulo]));
  return (
    <Box
      style={{
        border: `1px solid ${first?.cor ?? 'var(--mantine-color-default-border)'}`,
        borderRadius: 4,
        outline: highlighted ? '2px solid var(--mantine-primary-color-filled)' : undefined,
      }}
    >
      <UnstyledButton onClick={onToggle} aria-expanded={open} w="100%" px="xs" py={4}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" lineClamp={1} td={subtask.concluida ? 'line-through' : undefined}>
            {subtask.titulo}
          </Text>
          <Text size="xs" className="num" c="dimmed">
            {hours(subtask.horas)}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap={4} px="xs" pb="xs">
          <Group gap={4}>
            <Text size="xs" className="mono">
              {subtask.id}
            </Text>
            {subtask.url && (
              <Anchor href={subtask.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${subtask.id} no Jira`} c="dimmed">
                <IconExternalLink size={12} />
              </Anchor>
            )}
            <Badge size="xs" variant="default" tt="none">
              {KIND[subtask.tipo]}
            </Badge>
            {subtask.composta && (
              <Badge size="xs" variant="default" tt="none">
                composta
              </Badge>
            )}
            <Badge size="xs" variant="default" tt="none">
              {subtask.status}
            </Badge>
          </Group>
          <Group gap={4}>
            {subtask.papeis.map((id) => roles.get(id)).map((role) => role && <RoleChip key={role.id} role={role} />)}
          </Group>
          <Text size="xs">
            {subtask.rotulo_horas}
            {subtask.responsavel ? ` · responsável: ${subtask.responsavel}` : ''}
            {subtask.origem_papel ? ` · papel por ${ORIGIN_WORD[subtask.origem_papel]}` : ' · sem papel'}
          </Text>
          <Text size="xs" c="dimmed">
            Pré-requisitos:{' '}
            {subtask.prerequisitos.length
              ? subtask.prerequisitos.map((id) => `${id} (${titles.get(id) ?? '?'})`).join(', ')
              : 'nenhum'}
          </Text>
        </Stack>
      </Collapse>
    </Box>
  );
}

export function TaskCard({ task, view, highlight = [] }: { task: PlanTask; view: EpicPlanView; highlight?: string[] }) {
  const roles = roleIndex(view);
  const subtasks = new Map(view.subtarefas.map((s) => [s.id, s]));
  const tasks = new Map(view.tarefas.map((t) => [t.id, t]));
  const [open, setOpen] = useState<Set<string>>(new Set(highlight));
  const toggle = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Paper withBorder style={{ display: 'flex', overflow: 'hidden' }} h="100%">
      <Stripes task={task} roles={roles} />
      <Stack gap="xs" p="sm" style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap={6} wrap="nowrap">
            <Text fw={700}>{task.titulo}</Text>
            {task.url && (
              <Anchor href={task.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${task.id} no Jira`} c="dimmed">
                <IconExternalLink size={14} />
              </Anchor>
            )}
          </Group>
          <Tooltip label={task.horas_code_review ? 'execução + code review' : 'horas da tarefa'} withArrow>
            <Badge variant="light" tt="none" style={{ cursor: 'help', flex: '0 0 auto' }}>
              {task.rotulo_horas}
            </Badge>
          </Tooltip>
        </Group>
        <Group gap={4}>
          <Text size="xs" className="mono" c="dimmed">
            {task.id}
          </Text>
          {task.papeis.map((id) => roles.get(id)).map((role) => role && <RoleChip key={role.id} role={role} />)}
          {task.fase === 'planejamento' && (
            <Badge size="sm" variant="default" tt="none">
              planejamento
            </Badge>
          )}
        </Group>
        <Text size="sm">
          <Text span c="dimmed">
            Depende de:{' '}
          </Text>
          <b>{task.depende_de.length ? task.depende_de.map((id) => tasks.get(id)?.titulo ?? id).join(', ') : 'nada — início do pipeline'}</b>
          {task.observacao_dependencia && <Text span> — {task.observacao_dependencia}</Text>}
        </Text>
        {task.negocio && (
          <div>
            <Text size="xs" fw={700} tt="uppercase">
              Negócio
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {task.negocio}
            </Text>
          </div>
        )}
        {task.tecnico && (
          <div>
            <Text size="xs" fw={700} tt="uppercase">
              Técnico
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {task.tecnico}
            </Text>
          </div>
        )}
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Subtarefas{' '}
          <Text span size="xs" fw={400}>
            (clique para detalhes)
          </Text>
        </Text>
        <Stack gap={4}>
          {task.subtarefas.map((id) => {
            const subtask = subtasks.get(id);
            return (
              subtask && (
                <SubtaskRow
                  key={id}
                  subtask={subtask}
                  roles={roles}
                  view={view}
                  open={open.has(id)}
                  highlighted={highlight.includes(id)}
                  onToggle={() => toggle(id)}
                />
              )
            );
          })}
          {task.subtarefas.length === 0 && (
            <Text size="sm" c="dimmed">
              Sem subtarefas no Jira.
            </Text>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export function TaskCards({ view }: { view: EpicPlanView }) {
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      {view.tarefas.map((task) => (
        <TaskCard key={task.id} task={task} view={view} />
      ))}
    </SimpleGrid>
  );
}

/** What a click on a pipeline node or a schedule bar opens: the task, its subtasks highlighted. */
export interface TaskFocus {
  taskId: string;
  subtasks: string[];
}

export function TaskModal({ view, focus, onClose }: { view: EpicPlanView; focus: TaskFocus | null; onClose: () => void }) {
  const task = focus ? view.tarefas.find((t) => t.id === focus.taskId) : undefined;
  return (
    <Modal opened={!!task} onClose={onClose} size="lg" title={task ? `${task.id} · detalhes da tarefa` : ''}>
      {task && focus && <TaskCard key={`${task.id}-${focus.subtasks.join()}`} task={task} view={view} highlight={focus.subtasks} />}
    </Modal>
  );
}
