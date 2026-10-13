import { Alert, Badge, Button, Code, Group, List, Loader, Select, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { useAiStatus, useDraftNarrative, useTemplateA11y, useTemplateDiagnostics, useTemplateUsage } from '../../api/deckHooks';
import { useCreateVariable, useSetVariableValue, useVariables } from '../../api/hooks';
import type { TemplateDetail } from '../../api/types';
import { t as messages, useT } from '../../i18n';
import { ErrorState, Note } from '../common';
import { A11yList } from './RunPanels';

const SEVERITY = { erro: 'red', aviso: 'yellow', info: 'gray' } as const;

/** What an item of a diagnostic check is, in one line. */
function describe(item: unknown): string {
  const d = messages().deck.diagnostics;
  if (typeof item === 'number') return d.slideRef(item);
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    if (o.family) return `${o.family}${o.face ? ` → ${o.face}` : ''}`;
    if (o.marker) return d.onSlide(String(o.slide), `{{${o.marker}}}`);
    if (o.area) return d.onSlide(String(o.slide), String(o.name || o.area));
    if (o.message) return d.onSlide(String(o.slide), String(o.message));
  }
  return JSON.stringify(item);
}

/** #24: what to fix in a template before its first deck. Also the wizard's first step (#23). */
export function TemplateDiagnosticsPanel({ templateId }: { templateId: number }) {
  const t = useT();
  const d = t.deck.diagnostics;
  const diagnostics = useTemplateDiagnostics(templateId);
  if (diagnostics.isLoading) return <Loader size="sm" />;
  if (diagnostics.error) return <ErrorState error={diagnostics.error} />;
  const data = diagnostics.data!;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {d.size(data.slides, data.size_mb)}
      </Text>
      {!data.checks.length && (
        <Text size="sm" c="teal.8">
          {d.clean}
        </Text>
      )}
      {data.checks.map((check) => (
        <Stack key={check.id} gap={4}>
          <Group gap="xs">
            <Badge color={SEVERITY[check.severity]} variant="light">
              {d.severity[check.severity]}
            </Badge>
            <Text size="sm">{check.message}</Text>
          </Group>
          <List size="xs" ml="md">
            {check.items.slice(0, 8).map((item, i) => (
              <List.Item key={i}>{describe(item)}</List.Item>
            ))}
            {check.count > 8 && <List.Item>{t.deck.a11y.more(check.count - 8)}</List.Item>}
          </List>
        </Stack>
      ))}
    </Stack>
  );
}

/** #15: the template's own accessibility, before anything is generated from it. */
export function TemplateA11yPanel({ templateId, onOpen }: { templateId: number; onOpen?: (slide: number, shape: string | null) => void }) {
  const t = useT();
  const report = useTemplateA11y(templateId);
  if (report.isLoading) return <Loader size="sm" />;
  if (report.error) return <ErrorState error={report.error} />;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t.deck.templateA11y.intro}
      </Text>
      <A11yList report={report.data} onOpen={onOpen} />
    </Stack>
  );
}

/** #30: how the template behaves over its last decks, to trim it with data rather than taste. */
export function TemplateUsagePanel({ templateId }: { templateId: number }) {
  const t = useT();
  const u = t.deck.usage;
  const usage = useTemplateUsage(templateId);
  if (usage.isLoading) return <Loader size="sm" />;
  if (usage.error) return <ErrorState error={usage.error} />;
  const data = usage.data!;
  if (!data.runs) {
    return (
      <Text size="sm" c="dimmed">
        {u.none}
      </Text>
    );
  }
  return (
    <Stack gap="md">
      <Group gap="lg">
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {u.runs}
          </Text>
          <Text fw={600} className="num">
            {u.runsValue(data.runs, data.ok)}
          </Text>
        </Stack>
        {data.seconds_avg != null && (
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              {u.duration}
            </Text>
            <Text fw={600} className="num">
              {u.durationValue(data.seconds_avg, data.seconds_max)}
            </Text>
          </Stack>
        )}
      </Group>
      {data.suggestions.length > 0 && (
        <Note title={u.suggestions}>
          <List size="sm">
            {data.suggestions.map((s) => (
              <List.Item key={s}>{s}</List.Item>
            ))}
          </List>
        </Note>
      )}
      {data.dropped.length > 0 && (
        <Stack gap={4}>
          <Title order={6}>{u.dropped}</Title>
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
          <Title order={6}>{u.presented}</Title>
          <Table>
            <Table.Tbody>
              {data.presented.map((p) => (
                <Table.Tr key={p.slide_id}>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td className="num">{p.avg_seconds} s</Table.Td>
                  <Table.Td className="num" c="dimmed">
                    {u.times(p.times)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          {u.presentedEmpty}
        </Text>
      )}
      {data.problems.length > 0 && (
        <Stack gap={4}>
          <Title order={6}>{u.problems}</Title>
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
  const t = useT();
  const n = t.deck.narrative;
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
        {n.intro(<Code key="v">texto.narrativa</Code>, <Code key="m">{'{{texto.narrativa}}'}</Code>)}
      </Text>
      <Select
        label={n.board}
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
            {n.suggest}
          </Button>
          <Text size="xs" c="dimmed">
            {n.sendsOnly(ai.data.model ?? '')}
          </Text>
        </Group>
      ) : (
        <Alert variant="light" color="gray">
          {n.disabled(<Code key="e">CADENCIA_AI_ENABLED=true</Code>, <Code key="k">CADENCIA_ANTHROPIC_API_KEY</Code>)}
        </Alert>
      )}
      {draft.error && <ErrorState error={draft.error} title={n.noSuggestion} />}
      {draft.data && (
        <Text size="xs" c="dimmed">
          {n.draftFrom(Object.keys(draft.data.fatos).join(', '))}
        </Text>
      )}
      <Textarea label={n.text} autosize minRows={4} maxRows={12} value={text} onChange={(e) => setText(e.currentTarget.value)} />
      {(create.error || setValue.error) && <ErrorState error={(create.error ?? setValue.error)!} title={n.notSaved} />}
      <Group justify="space-between">
        {setValue.isSuccess && (
          <Text size="xs" c="teal.8">
            {n.saved}
          </Text>
        )}
        <Button ml="auto" onClick={() => void save()} loading={create.isPending || setValue.isPending} disabled={!boardId || text.trim() === (stored ?? '')}>
          {n.save}
        </Button>
      </Group>
    </Stack>
  );
}
