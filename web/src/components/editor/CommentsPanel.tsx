import { ActionIcon, Badge, Button, Group, Paper, SegmentedControl, Stack, Switch, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconCheck, IconArrowBackUp, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useAddComment, useComments, useDeleteComment, useResolveComment } from '../../api/featureHooks';
import type { DeckComment } from '../../api/types';
import { fromNow } from '../../lib/format';
import { ErrorState, Loading } from '../common';

/** The name comments are signed with when the server does not know who signed in. */
export function useAuthorName() {
  return useLocalStorage<string>({ key: 'cadencia-autor', defaultValue: '', getInitialValueInEffect: false });
}

/**
 * RF-93: review notes on a slide — or one shape of it — resolved before the meeting. They belong to
 * the *template* slide, so a note about "Resumo" is seen on every board's copy of it, and resolving
 * one is visible to everyone at once.
 */
export function CommentsPanel({
  templateId,
  originSlideId,
  slideLabel,
  shapeKey,
  shapeName,
  labelFor,
  onGo,
}: {
  templateId: number;
  originSlideId: number;
  slideLabel: string;
  /** The selected shape, when the note should be about it rather than the whole slide. */
  shapeKey: string | null;
  shapeName: string | null;
  labelFor: (originSlideId: number) => string;
  onGo: (originSlideId: number, shapeKey: string | null) => void;
}) {
  const comments = useComments(templateId);
  const add = useAddComment(templateId);
  const resolve = useResolveComment(templateId);
  const remove = useDeleteComment(templateId);
  const [author, setAuthor] = useAuthorName();
  const [scope, setScope] = useState<'slide' | 'all'>('slide');
  const [showResolved, setShowResolved] = useState(false);
  const [body, setBody] = useState('');
  const [aboutShape, setAboutShape] = useState(true);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reply, setReply] = useState('');

  if (comments.isLoading) return <Loading rows={3} />;
  if (comments.error) return <ErrorState error={comments.error} />;
  const items = comments.data?.items ?? [];
  const roots = items
    .filter((c) => c.parent_id === null)
    .filter((c) => scope === 'all' || c.origin_slide_id === originSlideId)
    .filter((c) => showResolved || !c.resolved_at);
  const replies = (id: number) => items.filter((c) => c.parent_id === id);

  const submit = () =>
    add.mutate(
      { origin_slide_id: originSlideId, shape_key: aboutShape ? shapeKey : null, body, author: author || undefined },
      { onSuccess: () => setBody('') },
    );

  const Entry = ({ comment, child = false }: { comment: DeckComment; child?: boolean }) => (
    <Stack gap={2} pl={child ? 'sm' : 0} style={child ? { borderLeft: '2px solid var(--mantine-color-default-border)' } : undefined}>
      <Group gap={6} justify="space-between" wrap="nowrap">
        <Text size="xs" fw={600} lineClamp={1}>
          {comment.author || 'anônimo'}{' '}
          <Text span size="xs" c="dimmed" fw={400}>
            {fromNow(comment.created_at)}
          </Text>
        </Text>
        <ActionIcon size="xs" variant="subtle" color="red" aria-label="Excluir comentário" onClick={() => remove.mutate(comment.id)}>
          <IconTrash size={12} />
        </ActionIcon>
      </Group>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {comment.body}
      </Text>
    </Stack>
  );

  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <SegmentedControl
          size="xs"
          value={scope}
          onChange={(v) => setScope(v as 'slide' | 'all')}
          data={[
            { value: 'slide', label: 'Este slide' },
            { value: 'all', label: `Todos (${comments.data?.open ?? 0} abertos)` },
          ]}
        />
        <Switch size="xs" label="resolvidos" checked={showResolved} onChange={(e) => setShowResolved(e.currentTarget.checked)} />
      </Group>

      <Paper withBorder p="xs">
        <Stack gap={6}>
          <Textarea
            size="xs"
            autosize
            minRows={2}
            placeholder={`Comentário sobre ${aboutShape && shapeName ? `“${shapeName}”` : slideLabel}…`}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            aria-label="Novo comentário"
          />
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <TextInput size="xs" placeholder="seu nome" value={author} onChange={(e) => setAuthor(e.currentTarget.value)} aria-label="Seu nome" w={120} />
            {shapeKey && <Switch size="xs" label="sobre a forma" checked={aboutShape} onChange={(e) => setAboutShape(e.currentTarget.checked)} />}
            <Button size="compact-xs" disabled={!body.trim()} loading={add.isPending} onClick={submit}>
              Comentar
            </Button>
          </Group>
        </Stack>
      </Paper>

      {roots.length === 0 && (
        <Text size="xs" c="dimmed">
          Nenhum comentário {showResolved ? '' : 'aberto '}
          {scope === 'slide' ? 'neste slide' : 'neste modelo'}.
        </Text>
      )}
      {roots.map((comment) => (
        <Paper key={comment.id} withBorder p="xs" style={comment.resolved_at ? { opacity: 0.6 } : undefined}>
          <Stack gap={6}>
            <Group gap={4}>
              {scope === 'all' && (
                <Badge size="xs" variant="light" style={{ cursor: 'pointer' }} onClick={() => onGo(comment.origin_slide_id, comment.shape_key)}>
                  {labelFor(comment.origin_slide_id)}
                </Badge>
              )}
              {comment.shape_key && (
                <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'pointer' }} onClick={() => onGo(comment.origin_slide_id, comment.shape_key)}>
                  forma {comment.shape_key}
                </Badge>
              )}
              {comment.resolved_at && (
                <Badge size="xs" color="teal" variant="light">
                  resolvido
                </Badge>
              )}
            </Group>
            <Entry comment={comment} />
            {replies(comment.id).map((r) => (
              <Entry key={r.id} comment={r} child />
            ))}
            {replyTo === comment.id ? (
              <Group gap={4} wrap="nowrap" align="flex-end">
                <Textarea size="xs" autosize minRows={1} value={reply} onChange={(e) => setReply(e.currentTarget.value)} style={{ flex: 1 }} aria-label="Resposta" data-autofocus />
                <Button
                  size="compact-xs"
                  disabled={!reply.trim()}
                  onClick={() => add.mutate({ parent_id: comment.id, body: reply, author: author || undefined }, { onSuccess: () => (setReply(''), setReplyTo(null)) })}
                >
                  Responder
                </Button>
              </Group>
            ) : (
              <Group gap={4}>
                <Button size="compact-xs" variant="subtle" onClick={() => setReplyTo(comment.id)}>
                  Responder
                </Button>
                <Tooltip label={comment.resolved_at ? 'Reabrir' : 'Marcar como resolvido'}>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={comment.resolved_at ? <IconArrowBackUp size={12} /> : <IconCheck size={12} />}
                    onClick={() => resolve.mutate({ id: comment.id, resolved: !comment.resolved_at })}
                  >
                    {comment.resolved_at ? 'Reabrir' : 'Resolver'}
                  </Button>
                </Tooltip>
              </Group>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
