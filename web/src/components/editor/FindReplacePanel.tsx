import { Badge, Button, Checkbox, Group, ScrollArea, SegmentedControl, Stack, Tabs, Text, TextInput, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';

import { plural } from '../../lib/format';
import { useReplaceInVariables } from '../../api/featureHooks';
import type { DeckEdits, SceneSlide } from '../../api/types';
import { effectiveShapes, withShapeEdit } from '../../lib/deckEdits';
import { findMatches, replacedParagraphs, type Match } from '../../lib/findReplace';
import { ErrorState } from '../common';

/**
 * RF-88: find and replace, over this slide or the whole deck, and over the variables' values.
 *
 * Text on the slides is replaced as manual overrides, run by run, in one undo step. A shape bound to
 * data is listed but left alone — the next generation would put the data back — and the variables
 * tab is where a word that comes *from* a variable gets changed.
 */
export function FindReplacePanel({
  templateId,
  slides,
  edits,
  currentKey,
  keyFor,
  onChange,
  onGo,
}: {
  templateId: number;
  slides: SceneSlide[];
  edits: DeckEdits;
  currentKey: string;
  /** Where an edit to this slide is written: the slide itself on a run, the template key otherwise. */
  keyFor: (slide: SceneSlide) => string;
  onChange: (next: DeckEdits) => void;
  onGo: (slideKey: string, shapeKey: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState<'slide' | 'deck'>('deck');
  const variables = useReplaceInVariables();

  const inScope = useMemo(() => (scope === 'slide' ? slides.filter((s) => s.key === currentKey) : slides), [scope, slides, currentKey]);
  const matches = useMemo(() => findMatches(inScope, edits, query, matchCase), [inScope, edits, query, matchCase]);
  const editable = matches.filter((m) => !m.bound);

  const replace = (targets: Match[]) => {
    let next = edits;
    const done = new Set<string>();
    for (const match of targets) {
      const id = `${match.slideKey}/${match.shapeKey}`;
      if (match.bound || done.has(id)) continue;
      done.add(id);
      const slide = slides.find((s) => s.key === match.slideKey);
      const shape = slide && effectiveShapes(slide, next).find((s) => s.key === match.shapeKey);
      if (!slide || !shape) continue;
      const paragraphs = replacedParagraphs(shape, query, replacement, matchCase);
      if (paragraphs) next = withShapeEdit(next, keyFor(slide), shape.key, { text: { paragraphs } });
    }
    if (next !== edits) {
      onChange(next);
      notifications.show({ title: 'Substituído', message: `${done.size === 1 ? '1 forma alterada' : `${done.size} formas alteradas`}. Ctrl+Z desfaz.` });
    }
  };

  return (
    <Tabs defaultValue="slides" keepMounted={false}>
      <Tabs.List grow>
        <Tabs.Tab value="slides">Nos slides</Tabs.Tab>
        <Tabs.Tab value="variaveis">Nas variáveis</Tabs.Tab>
      </Tabs.List>
      <Stack gap="xs" p="sm">
        <TextInput size="xs" label="Localizar" value={query} onChange={(e) => setQuery(e.currentTarget.value)} data-autofocus />
        <TextInput size="xs" label="Substituir por" value={replacement} onChange={(e) => setReplacement(e.currentTarget.value)} />
        <Checkbox size="xs" label="Diferenciar maiúsculas" checked={matchCase} onChange={(e) => setMatchCase(e.currentTarget.checked)} />
      </Stack>
      <Tabs.Panel value="slides">
        <Stack gap="xs" px="sm" pb="sm">
          <SegmentedControl
            size="xs"
            value={scope}
            onChange={(value) => setScope(value as 'slide' | 'deck')}
            data={[
              { value: 'deck', label: 'Apresentação inteira' },
              { value: 'slide', label: 'Este slide' },
            ]}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {query ? `${plural(matches.length, 'ocorrência', 'ocorrências')} em parágrafos` : 'Digite o texto a localizar.'}
            </Text>
            <Button size="compact-xs" disabled={!editable.length} onClick={() => replace(editable)}>
              Substituir todas ({editable.length})
            </Button>
          </Group>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={2}>
              {matches.map((match, index) => (
                <Group key={`${match.slideKey}-${match.shapeKey}-${match.paragraph}-${index}`} gap={4} wrap="nowrap" justify="space-between">
                  <UnstyledButton onClick={() => onGo(match.slideKey, match.shapeKey)} style={{ flex: 1, minWidth: 0 }} p={4}>
                    <Text size="xs" c="dimmed">
                      Slide {match.slideIndex + 1} · {match.shapeName}
                    </Text>
                    <Text size="xs" lineClamp={2}>
                      {match.text}
                    </Text>
                  </UnstyledButton>
                  {match.bound ? (
                    <Badge size="xs" variant="outline" color="gray" title="Vinculada a dados: mude a variável ou o campo">
                      dados
                    </Badge>
                  ) : (
                    <Button size="compact-xs" variant="subtle" onClick={() => replace([match])}>
                      Substituir
                    </Button>
                  )}
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="variaveis">
        <Stack gap="xs" px="sm" pb="sm">
          <Text size="xs" c="dimmed">
            Procura nos valores de todas as variáveis que este modelo usa, em todos os níveis, e nos padrões do registro.
          </Text>
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="default"
              disabled={!query}
              loading={variables.isPending && !variables.variables?.apply}
              onClick={() => variables.mutate({ find: query, replace: replacement, match_case: matchCase, template_id: templateId, apply: false })}
            >
              Pré-visualizar
            </Button>
            <Button
              size="compact-xs"
              disabled={!query || !variables.data?.count || variables.data.applied}
              loading={variables.isPending && variables.variables?.apply}
              onClick={() => variables.mutate({ find: query, replace: replacement, match_case: matchCase, template_id: templateId, apply: true })}
            >
              Substituir nas variáveis
            </Button>
          </Group>
          {variables.error && <ErrorState error={variables.error} />}
          {variables.data && (
            <Stack gap={4}>
              <Text size="xs" fw={500}>
                {variables.data.applied
                  ? variables.data.count === 1
                    ? '1 valor substituído.'
                    : `${variables.data.count} valores substituídos.`
                  : variables.data.count === 1
                    ? '1 valor seria alterado:'
                    : `${variables.data.count} valores seriam alterados:`}
              </Text>
              {variables.data.matches.map((m, i) => (
                <Text key={i} size="xs">
                  <span className="mono">{m.variable}</span> ({m.scope}
                  {m.scope_key ? ` ${m.scope_key}` : ''}): {m.before} → <b>{m.after}</b>
                </Text>
              ))}
            </Stack>
          )}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
