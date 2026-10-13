import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Chip,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import {
  useDigest,
  useNotifications,
  useSaveChannels,
  useSaveDigestSchedule,
  useSendDigest,
  useTestChannel,
} from '../api/featureHooks';
import type { DigestSchedule, NotifyChannel, NotifyEvent } from '../api/types';
import { useT } from '../i18n';
import { TIMEZONES, fmtDateTime, weekdays } from '../lib/format';
import { ErrorState, Loading } from './common';

const KINDS = ['slack', 'teams', 'webhook', 'email'] as const;

const blank = (): NotifyChannel => ({ name: '', kind: 'slack', target: '', events: ['deck', 'digest'], enabled: true });

/**
 * RF-71 and RF-73: where Cadência speaks up — a deck was generated, the morning risk digest, a
 * scheduled collection failed. Webhook addresses are credentials, so they come back masked; sending
 * the masked value back keeps the stored one.
 */
export function NotificationsSettings() {
  const t = useT();
  const w = t.shell.notifications;
  const view = useNotifications();
  const save = useSaveChannels();
  const saveDigest = useSaveDigestSchedule();
  const test = useTestChannel();
  const digest = useDigest();
  const send = useSendDigest();
  const [draft, setDraft] = useState<NotifyChannel[]>([]);
  const [schedule, setSchedule] = useState<DigestSchedule | null>(null);

  useEffect(() => {
    if (view.data) {
      setDraft(view.data.channels);
      setSchedule(view.data.digest);
    }
  }, [view.data]);

  if (view.isLoading || !schedule) return <Loading rows={4} />;
  if (view.error) return <ErrorState error={view.error} />;
  const data = view.data!;
  const patch = (index: number, change: Partial<NotifyChannel>) => setDraft(draft.map((c, i) => (i === index ? { ...c, ...change } : c)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.channels);

  return (
    <Stack gap="lg" maw={1100}>
      {!data.public_url && (
        <Alert color="yellow" variant="light" title={w.linksTitle}>
          {w.linksBody(<code key="variable">CADENCIA_PUBLIC_URL</code>)}
        </Alert>
      )}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>{w.channels}</Title>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setDraft([...draft, blank()])}>
            {w.addChannel}
          </Button>
        </Group>
        {draft.length === 0 && (
          <Text size="sm" c="dimmed">
            {w.noChannels}
          </Text>
        )}
        {draft.length > 0 && (
          <Table.ScrollContainer minWidth={980}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{w.name}</Table.Th>
                  <Table.Th>{w.type}</Table.Th>
                  <Table.Th>{w.target}</Table.Th>
                  <Table.Th>{w.events}</Table.Th>
                  <Table.Th>{w.enabled}</Table.Th>
                  <Table.Th>{w.lastSent}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {draft.map((channel, index) => (
                  <Table.Tr key={channel.id ?? `novo-${index}`}>
                    <Table.Td>
                      <TextInput size="xs" value={channel.name} placeholder={w.namePlaceholder} onChange={(e) => patch(index, { name: e.currentTarget.value })} aria-label={w.channelName} w={150} />
                    </Table.Td>
                    <Table.Td>
                      <Select size="xs" data={KINDS.map((kind) => ({ value: kind, label: w.kinds[kind] }))} value={channel.kind} onChange={(value) => value && patch(index, { kind: value as NotifyChannel['kind'] })} allowDeselect={false} w={150} aria-label={w.channelType} />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        size="xs"
                        value={channel.target}
                        placeholder={channel.kind === 'email' ? w.emailPlaceholder : 'https://hooks.slack.com/services/…'}
                        onChange={(e) => patch(index, { target: e.currentTarget.value })}
                        aria-label={w.target}
                        w={260}
                      />
                      {channel.kind === 'email' && !data.smtp_configured && (
                        <Text size="xs" c="yellow.8">
                          {w.smtpMissing}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Chip.Group multiple value={channel.events} onChange={(value) => patch(index, { events: value as NotifyEvent[] })}>
                        <Group gap={4}>
                          {data.events.map((event) => (
                            <Chip key={event.id} value={event.id} size="xs">
                              {event.label}
                            </Chip>
                          ))}
                        </Group>
                      </Chip.Group>
                    </Table.Td>
                    <Table.Td>
                      <Checkbox checked={channel.enabled} onChange={(e) => patch(index, { enabled: e.currentTarget.checked })} aria-label={w.channelEnabled} />
                    </Table.Td>
                    <Table.Td>
                      {channel.last ? (
                        <Tooltip label={channel.last.error ?? fmtDateTime(channel.last.at)} multiline w={260}>
                          <Badge color={channel.last.ok ? 'teal' : 'red'} variant="light" style={{ cursor: 'help' }}>
                            {channel.last.ok ? w.delivered : w.failed}
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Text size="xs" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label={channel.id && !dirty ? w.sendTest : w.saveFirst}>
                          <ActionIcon
                            variant="default"
                            aria-label={w.testChannel}
                            disabled={!channel.id || dirty}
                            loading={test.isPending && test.variables === channel.id}
                            onClick={() =>
                              channel.id &&
                              test.mutate(channel.id, {
                                onSuccess: (r) =>
                                  notifications.show({
                                    color: r.result?.ok ? 'teal' : 'red',
                                    title: r.result?.ok ? w.testSent : w.testFailed,
                                    message: r.result?.error ?? w.checkChannel,
                                  }),
                              })
                            }
                          >
                            <IconSend size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <ActionIcon variant="subtle" color="red" aria-label={w.removeChannel} onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {save.error && <ErrorState error={save.error} title={w.notSaved} />}
        <Group justify="flex-end" mt="sm">
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft, { onSuccess: () => notifications.show({ title: w.saved, message: '' }) })}>
            {w.saveChannels}
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="xs">
          {w.digestTitle}
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          {w.digestBody}
        </Text>
        <Stack gap="sm">
          <Switch label={w.autoSend} checked={schedule.enabled} onChange={(e) => setSchedule({ ...schedule, enabled: e.currentTarget.checked })} />
          <Group gap="md" align="flex-end" wrap="wrap">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {w.days}
              </Text>
              <Chip.Group multiple value={schedule.weekdays.map(String)} onChange={(value) => setSchedule({ ...schedule, weekdays: value.map(Number).sort() })}>
                <Group gap={4}>
                  {weekdays().map((day, index) => (
                    <Chip key={day} value={String(index)} size="xs">
                      {day.slice(0, 3)}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Stack>
            <NumberInput label={w.hour} min={0} max={23} value={schedule.hour} onChange={(v) => setSchedule({ ...schedule, hour: Number(v) || 0 })} w={90} />
            <Select label={w.timezone} data={TIMEZONES} value={schedule.timezone} onChange={(v) => v && setSchedule({ ...schedule, timezone: v })} searchable w={220} allowDeselect={false} />
            <Button
              variant="default"
              loading={saveDigest.isPending}
              disabled={!schedule.weekdays.length}
              onClick={() => saveDigest.mutate(schedule, { onSuccess: () => notifications.show({ title: w.scheduleSaved, message: w.scheduleSavedMessage }) })}
            >
              {w.saveSchedule}
            </Button>
          </Group>
          {saveDigest.error && <ErrorState error={saveDigest.error} />}
        </Stack>
        <Title order={5} mt="lg" mb="xs">
          {w.todayPreview}
        </Title>
        {digest.isLoading && <Loading rows={2} />}
        {digest.data && (
          <Stack gap="xs">
            {digest.data.spaces.map((space) => {
              const risks = space.boards.flatMap((b) => b.new_risks);
              return (
                <Paper key={space.space.key ?? 'sem'} withBorder p="xs">
                  <Text size="sm" fw={500}>
                    {w.newRisks(space.space.name, risks.length)}
                  </Text>
                  {risks.slice(0, 8).map((r) => (
                    <Text key={r.key} size="xs">
                      • <span className="mono">{r.key}</span> {r.label}: {r.summary}
                    </Text>
                  ))}
                </Paper>
              );
            })}
            <Group>
              <Button
                size="xs"
                leftSection={<IconSend size={14} />}
                loading={send.isPending}
                disabled={!data.channels.some((c) => c.enabled && c.events.includes('digest'))}
                onClick={() =>
                  send.mutate(undefined, {
                    onSuccess: (r) =>
                      notifications.show({
                        title: r.sent.length ? w.digestSent : w.nothingNew,
                        message: r.sent.map((s) => `${s.space.name}: ${s.new_risks}`).join(' · ') || w.nothingNewMessage,
                      }),
                  })
                }
              >
                {w.sendNow}
              </Button>
              <Text size="xs" c="dimmed">
                {w.goesTo(data.events.find((e) => e.id === 'digest')?.label ?? '')}
              </Text>
            </Group>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
