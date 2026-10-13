import { Alert, Badge, Button, Code, Group, List, Loader, Select, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { plural } from '../../lib/format';
import { useAiStatus, useDraftNarrative, useTemplateA11y, useTemplateDiagnostics, useTemplateUsage } from '../../api/deckHooks';
import { useCreateVariable, useSetVariableValue, useVariables } from '../../api/hooks';
import type { TemplateDetail } from '../../api/types';
import { ErrorState, Note } from '../common';
import { A11yList } from './RunPanels';

const SEVERITY = { erro: 'red', aviso: 'yellow', info: 'gray' } as const;

/** What an item of a diagnostic check is, in one line. */
function describe(item: unknown): string {
  if (typeof item === 'number') return `slide ${item}`;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    if (o.family) return `${o.family}${o.face ? ` → ${o.face}` : ''}`;
    if (o.marker) return `slide ${o.slide}: {{${o.marker}}}`;
    if (o.area) return `slide ${o.slide}: ${o.name || o.area}`;
    if (o.message) return `slide ${o.slide}: ${o.message}`;
  }
  return JSON.stringify(item);
}

/** #24: what to fix in a template before its first deck. Also the wizard's first step (#23). */
export function TemplateDiagnosticsPanel({ templateId }: { templateId: number }) {
  const diagnostics = useTemplateDiagnostics(templateId);
  if (diagnostics.isLoading) return <Loader size="sm" />;
  if (diagnostics.error) return <ErrorState error={diagnostics.error} />;
  const data = diagnostics.data!;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {data.slides} slides{data.size_mb != null ? ` · ${data.size_mb} MB` : ''}
      </Text>
      {!data.checks.length && (
        <Text size="sm" c="teal.8">
          Nada a corrigir: fontes, marcadores, vínculos, nomes e imagens estão em ordem.
        </Text>
      )}
      {data.checks.map((check) => (
        <Stack key={check.id} gap={4}>
          <Group gap="xs">
            <Badge color={SEVERITY[check.severity]} variant="light">
              {check.severity}
            </Badge>
            <Text size="sm">{check.message}</Text>
          </Group>
          <List size="xs" ml="md">
            {check.items.slice(0, 8).map((item, i) => (
              <List.Item key={i}>{describe(item)}</List.Item>
            ))}
            {check.count > 8 && <List.Item>…e mais {check.count - 8}.</List.Item>}
          </List>
        </Stack>
      ))}
    </Stack>
  );
}

/** #15: the template's own accessibility, before anything is generated from it. */
export function TemplateA11yPanel({ templateId, onOpen }: { templateId: number; onOpen?: (slide: number, shape: string | null) => void }) {
  const report = useTemplateA11y(templateId);
  if (report.isLoading) return <Loader size="sm" />;
  if (report.error) return <ErrorState error={report.error} />;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Imagens e gráficos sem texto alternativo, texto com contraste abaixo de 4,5:1 (3:1 para
        texto grande) e slides cujo título não é o primeiro a ser lido. Cada geração repete esta
        verificação e mostra o resultado junto da validação.
      </Text>
      <A11yList report={report.data} onOpen={onOpen} />
    </Stack>
  );
}

/** #30: how the template behaves over its last decks, to trim it with data rather than taste. */
export function TemplateUsagePanel({ templateId }: { templateId: number }) {
  const usage = useTemplateUsage(templateId);
  if (usage.isLoading) return <Loader size="sm" />;
  if (usage.error) return <ErrorState error={usage.error} />;
  const data = usage.data!;
  if (!data.runs) {
    return (
      <Text size="sm" c="dimmed">
        Nenhuma apresentação de entrega gerada com este modelo ainda.
      </Text>
    );
  }
  return (
    <Stack gap="md">
      <Group gap="lg">
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            Gerações
          </Text>
          <Text fw={600} className="num">
            {data.runs} ({data.ok} ok)
          </Text>
        </Stack>
        {data.seconds_avg != null && (
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              Tempo de geração
            </Text>
            <Text fw={600} className="num">
              {data.seconds_avg} s (máx. {data.seconds_max} s)
            </Text>
          </Stack>
        )}
      </Group>
      {data.suggestions.length > 0 && (
        <Note title="Sugestões">
          <List size="sm">
            {data.suggestions.map((s) => (
              <List.Item key={s}>{s}</List.Item>
            ))}
          </List>
        </Note>
      )}
      {data.dropped.length > 0 && (
        <Stack gap={4}>
          <Title order={6}>Slides que saíram vazios e foram retirados</Title>
          <Table>
            <Table.Tbody>
              {data.dropped.map((d) => (
                <Table.Tr key={d.slide_id}>
                  <Table.Td>{d.name}</Table.Td>
                  <Table.Td className="num">{d.count}×</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
      {data.presented.length > 0 ? (
        <Stack gap={4}>
          <Title order={6}>Tempo médio na tela ao apresentar</Title>
          <Table>
            <Table.Tbody>
              {data.presented.map((p) => (
                <Table.Tr key={p.slide_id}>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td className="num">{p.avg_seconds} s</Table.Td>
                  <Table.Td className="num" c="dimmed">
                    {plural(p.times, 'apresentação', 'apresentações')}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          O tempo por slide aparece depois que alguém apresentar pela Cadência (Apresentar daqui).
        </Text>
      )}
      {data.problems.length > 0 && (
        <Stack gap={4}>
          <Title order={6}>Problemas mais frequentes na validação</Title>
          <Group gap={4}>
            {data.problems.map((p) => (
              <Badge key={p.kind} variant="light" color="gray">
                {p.kind} · {p.count}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

const NARRATIVE = 'narrativa';

/**
 * #7: an opening paragraph for a board's slide. Claude drafts it from the deck's own numbers
 * (never names or titles); the person edits it; saving stores it as the board's value of the
 * `narrativa` variable, which a slide shows with {{texto.narrativa}}. Off unless the server was
 * started with CADENCIA_AI_ENABLED, because the numbers leave Cadência.
 */
export function NarrativePanel({ templateId, boards }: { templateId: number; boards: TemplateDetail['boards'] }) {
  const ai = useAiStatus();
  const [boardId, setBoardId] = useState<string | null>(boards[0] ? String(boards[0].id) : null);
  const variables = useVariables({ templateId, boardId: boardId ? Number(boardId) : null });
  const draft = useDraftNarrative(templateId);
  const create = useCreateVariable();
  const setValue = useSetVariableValue();
  const [text, setText] = useState('');
  const variable = variables.data?.items.find((v) => v.name === NARRATIVE);
  const stored = variable?.values.find((v) => v.scope === 'board' && v.scope_key === boardId)?.value;

  // Switching board shows what that board already has, not the previous board's draft.
  useEffect(() => {
    setText(stored ?? '');
    draft.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, stored]);

  const save = async () => {
    if (!boardId) return;
    const target = variable ?? (await create.mutateAsync({ name: NARRATIVE, label: 'Narrativa do time', template_id: null, default: '' }));
    setValue.mutate({ id: target.id, scope: 'board', scope_key: boardId, value: text.trim() });
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Um parágrafo de abertura por board, guardado na variável <Code>texto.narrativa</Code>. Coloque o
        marcador <Code>{'{{texto.narrativa}}'}</Code> numa caixa do slide repetido por board.
      </Text>
      <Select
        label="Board"
        data={boards.map((b) => ({ value: String(b.id), label: b.space_name ? `${b.name} · ${b.space_name}` : b.name }))}
        value={boardId}
        onChange={setBoardId}
        searchable
      />
      {ai.data?.enabled ? (
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<IconSparkles size={16} />}
            loading={draft.isPending}
            disabled={!boardId}
            onClick={() => boardId && draft.mutate(Number(boardId), { onSuccess: (r) => setText(r.texto) })}
          >
            Sugerir com IA
          </Button>
          <Text size="xs" c="dimmed">
            Envia só números do board ({ai.data.model}); nenhum nome de pessoa ou título de item.
          </Text>
        </Group>
      ) : (
        <Alert variant="light" color="gray">
          A sugestão por IA está desligada neste servidor. Quem administra pode ligá-la com
          <Code>CADENCIA_AI_ENABLED=true</Code> e <Code>CADENCIA_ANTHROPIC_API_KEY</Code>. O texto pode ser escrito à mão.
        </Alert>
      )}
      {draft.error && <ErrorState error={draft.error} title="Sem sugestão" />}
      {draft.data && (
        <Text size="xs" c="dimmed">
          Rascunho feito a partir de: {Object.keys(draft.data.fatos).join(', ')}. Revise antes de salvar.
        </Text>
      )}
      <Textarea label="Texto" autosize minRows={4} maxRows={12} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      {(create.error || setValue.error) && <ErrorState error={(create.error ?? setValue.error)!} title="Não salvo" />}
      <Group justify="space-between">
        {setValue.isSuccess && (
          <Text size="xs" c="teal.8">
            Salvo para este board.
          </Text>
        )}
        <Button ml="auto" onClick={() => void save()} loading={create.isPending || setValue.isPending} disabled={!boardId || text.trim() === (stored ?? '')}>
          Salvar para o board
        </Button>
      </Group>
    </Stack>
  );
}
