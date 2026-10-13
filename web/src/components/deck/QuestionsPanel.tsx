import { ActionIcon, Badge, Button, Checkbox, Group, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconSend2, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useAnswerQuestion, useAskQuestion, useDeleteQuestion, useQuestions } from '../../api/deckHooks';
import { useT } from '../../i18n';
import { fmtDateTime } from '../../lib/format';
import { ErrorState } from '../common';

/**
 * Slides' audience Q&A. There is no separate public join link (see `ReportQuestionRow`'s own
 * docstring): anyone who already reaches Cadência — a teammate watching along on their own device
 * — can type a question here, and the same list is what the presenter moderates from `PresentMode`.
 */
export function QuestionsPanel({ runId, live = false }: { runId: string; live?: boolean }) {
  const t = useT();
  const questions = useQuestions(runId, live);
  const ask = useAskQuestion(runId);
  const answer = useAnswerQuestion(runId);
  const remove = useDeleteQuestion(runId);
  const [text, setText] = useState('');
  const items = questions.data?.items ?? [];
  const pending = items.filter((q) => !q.answered_at).length;

  const send = () => {
    const value = text.trim();
    if (!value) return;
    ask.mutate(value, { onSuccess: () => setText('') });
  };

  return (
    <Stack gap="xs" h="100%">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {t.deck.questions.title}
        </Text>
        {pending > 0 && (
          <Badge size="sm" color="petrol">
            {t.deck.questions.unanswered(pending)}
          </Badge>
        )}
      </Group>
      <Group gap={4} wrap="nowrap">
        <TextInput
          size="sm"
          placeholder={t.deck.questions.placeholder}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          style={{ flex: 1 }}
        />
        <ActionIcon size="lg" variant="filled" aria-label={t.deck.questions.send} disabled={!text.trim()} loading={ask.isPending} onClick={send}>
          <IconSend2 size={16} />
        </ActionIcon>
      </Group>
      {ask.error && <ErrorState error={ask.error} title={t.deck.questions.sendFailed} />}
      <ScrollArea style={{ flex: 1 }}>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t.deck.questions.empty}
          </Text>
        ) : (
          <Stack gap="xs">
            {items.map((q) => (
              <Stack key={q.id} gap={2} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 6 }}>
                <Text size="sm">{q.text}</Text>
                <Group justify="space-between" gap={4}>
                  <Text size="xs" c="dimmed">
                    {q.author ? `${q.author} · ` : ''}
                    {fmtDateTime(q.asked_at)}
                  </Text>
                  <Group gap={4}>
                    <Checkbox
                      size="xs"
                      label={t.deck.questions.answered}
                      checked={Boolean(q.answered_at)}
                      onChange={(e) => answer.mutate({ id: q.id, answered: e.currentTarget.checked })}
                    />
                    <Tooltip label={t.deck.questions.remove}>
                      <ActionIcon size="sm" variant="subtle" color="red" aria-label={t.deck.questions.removeQuestion} onClick={() => remove.mutate(q.id)}>
                        <IconTrash size={13} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Stack>
            ))}
          </Stack>
        )}
      </ScrollArea>
      {!live && (
        <Button size="compact-xs" variant="subtle" onClick={() => questions.refetch()} loading={questions.isFetching}>
          {t.deck.questions.refresh}
        </Button>
      )}
    </Stack>
  );
}
