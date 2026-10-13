import { Box, Group, Stack, Tabs, Text } from '@mantine/core';
import { useMemo, useState } from 'react';

import type { EpicPlanView, PlanGraph } from '../../api/types';
import { Note } from '../common';
import { hours, roleIndex } from './shared';
import type { TaskFocus } from './TaskCards';

interface Node {
  id: string;
  title: string;
  roles: number[];
  hours: number;
  summary: string;
  taskId: string;
}

interface Size {
  width: number;
  height: number;
}

const GAP_X = 56;
const GAP_Y = 16;
const PAD = 16;

/** Columns come from the API (longest prerequisite chain); inside a column, nodes sit near the
 *  average row of their predecessors so arrows cross less. Presentation only. */
function layout(graph: PlanGraph, size: Size) {
  const preds = new Map<string, string[]>();
  for (const edge of graph.arestas) preds.set(edge.para, [...(preds.get(edge.para) ?? []), edge.de]);
  const columns = new Map<number, string[]>();
  for (const node of graph.nos) columns.set(node.camada, [...(columns.get(node.camada) ?? []), node.id]);
  const row = new Map<string, number>();
  const position = new Map<string, { x: number; y: number }>();
  let rows = 0;
  for (const layer of [...columns.keys()].sort((a, b) => a - b)) {
    const ids = columns.get(layer)!;
    const weight = (id: string, index: number) => {
      const placed = (preds.get(id) ?? []).map((p) => row.get(p)).filter((r): r is number => r !== undefined);
      return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : index;
    };
    const sorted = ids.map((id, index) => ({ id, w: weight(id, index), index })).sort((a, b) => a.w - b.w || a.index - b.index);
    sorted.forEach(({ id }, index) => {
      row.set(id, index);
      position.set(id, { x: PAD + layer * (size.width + GAP_X), y: PAD + index * (size.height + GAP_Y) });
    });
    rows = Math.max(rows, ids.length);
  }
  const layers = columns.size ? Math.max(...columns.keys()) + 1 : 0;
  return {
    position,
    width: PAD * 2 + layers * size.width + Math.max(layers - 1, 0) * GAP_X,
    height: PAD * 2 + rows * size.height + Math.max(rows - 1, 0) * GAP_Y,
  };
}

function Diagram({
  graph,
  nodes,
  size,
  view,
  onOpen,
  label,
}: {
  graph: PlanGraph;
  nodes: Map<string, Node>;
  size: Size;
  view: EpicPlanView;
  onOpen: (focus: TaskFocus) => void;
  label: string;
}) {
  const roles = roleIndex(view);
  const { position, width, height } = useMemo(() => layout(graph, size), [graph, size]);
  return (
    <div className="pipeline" style={{ maxHeight: 560 }}>
      <div style={{ position: 'relative', width, height }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={label}>
          <defs>
            <marker id="pipeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mantine-primary-color-filled)" />
            </marker>
          </defs>
          {graph.arestas.map((edge) => {
            const from = position.get(edge.de);
            const to = position.get(edge.para);
            if (!from || !to) return null;
            const x1 = from.x + size.width;
            const y1 = from.y + size.height / 2;
            const x2 = to.x;
            const y2 = to.y + size.height / 2;
            const bend = Math.max(GAP_X / 2, Math.abs(x2 - x1) / 3);
            return (
              <path
                key={`${edge.de}-${edge.para}`}
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 2} ${y2}`}
                fill="none"
                stroke="var(--mantine-primary-color-filled)"
                strokeWidth={1.5}
                markerEnd="url(#pipeline-arrow)"
              />
            );
          })}
        </svg>
        {graph.nos.map(({ id }) => {
          const node = nodes.get(id);
          const at = position.get(id);
          if (!node || !at) return null;
          const nodeRoles = node.roles.map((r) => roles.get(r)).filter((r) => !!r);
          return (
            <button
              key={id}
              type="button"
              className="pipeline-node"
              style={{ left: at.x, top: at.y, width: size.width, height: size.height }}
              onClick={() => onOpen({ taskId: node.taskId, subtasks: node.id === node.taskId ? [] : [node.id] })}
              aria-label={`${node.title}, ${hours(node.hours)}. Abrir detalhes`}
            >
              <Box style={{ display: 'flex', flexDirection: 'column', width: 6, flex: '0 0 6px' }} aria-hidden>
                {nodeRoles.map((role) => (
                  <Box key={role!.id} style={{ flex: 1, background: role!.cor }} />
                ))}
              </Box>
              <Stack gap={0} p={6} style={{ minWidth: 0, flex: 1 }}>
                <Group justify="space-between" wrap="nowrap" gap={4}>
                  <Text size="10px" tt="uppercase" c="dimmed" lineClamp={1}>
                    {nodeRoles.map((r) => r!.nome).join(' + ') || 'sem papel'}
                  </Text>
                  <Text size="10px" fw={700} className="num">
                    {hours(node.hours)}
                  </Text>
                </Group>
                <Text size="xs" fw={600} lineClamp={2} lh={1.25}>
                  {node.title}
                </Text>
                {node.summary && (
                  <Text size="10px" c="dimmed" lineClamp={1}>
                    {node.summary}
                  </Text>
                )}
              </Stack>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TASK_SIZE = { width: 210, height: 78 };
const SUBTASK_SIZE = { width: 190, height: 66 };

export function PipelineSection({ view, onOpen }: { view: EpicPlanView; onOpen: (focus: TaskFocus) => void }) {
  const [tab, setTab] = useState<string | null>('tarefas');
  const taskNodes = useMemo(
    () =>
      new Map(
        view.tarefas.map((t) => [t.id, { id: t.id, title: t.titulo, roles: t.papeis, hours: t.horas, summary: t.resumo, taskId: t.id }]),
      ),
    [view.tarefas],
  );
  const subtaskNodes = useMemo(
    () =>
      new Map(
        view.subtarefas.map((s) => [
          s.id,
          { id: s.id, title: s.titulo, roles: s.papeis, hours: s.horas, summary: s.id, taskId: s.tarefa_id },
        ]),
      ),
    [view.subtarefas],
  );
  return (
    <Stack gap="sm">
      <Tabs value={tab} onChange={setTab} variant="pills">
        <Tabs.List mb="sm">
          <Tabs.Tab value="tarefas">Tarefas</Tabs.Tab>
          <Tabs.Tab value="subtarefas">Subtarefas</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="tarefas">
          <Diagram
            graph={view.pipeline.tarefas}
            nodes={taskNodes}
            size={TASK_SIZE}
            view={view}
            onOpen={onOpen}
            label="Pipeline de dependências entre tarefas"
          />
        </Tabs.Panel>
        <Tabs.Panel value="subtarefas">
          <Diagram
            graph={view.pipeline.subtarefas}
            nodes={subtaskNodes}
            size={SUBTASK_SIZE}
            view={view}
            onOpen={onOpen}
            label="Pipeline de dependências entre subtarefas"
          />
        </Tabs.Panel>
      </Tabs>
      <Group gap="md">
        <Group gap={6}>
          <Box w={24} h={2} bg="var(--mantine-primary-color-filled)" />
          <Text size="xs" c="dimmed">
            dependência bloqueante
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          Clique num card para ver os detalhes completos da tarefa.
        </Text>
      </Group>
      {view.pipeline.notas.length > 0 && (
        <Note title="Observações de dependência">
          {view.pipeline.notas.map((note) => (
            <span key={note.tarefa_id} style={{ display: 'block' }}>
              <b>{note.titulo}:</b> {note.texto}
            </span>
          ))}
        </Note>
      )}
    </Stack>
  );
}
