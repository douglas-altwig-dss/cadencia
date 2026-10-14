import { Accordion, Alert, Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { Link } from 'react-router';

import { useHealthCheck } from '../api/featureHooks';
import type { HealthCheck } from '../api/types';
import { useT } from '../i18n';
import { ErrorState, Loading } from './common';
import { OpenInJira } from './OpenInJira';

const SEVERITY = {
  erro: { color: 'red', icon: IconX },
  aviso: { color: 'yellow', icon: IconAlertTriangle },
  info: { color: 'gray', icon: IconInfoCircle },
} as const;

function Check({ check }: { check: HealthCheck }) {
  const t = useT();
  const severity = SEVERITY[check.severity];
  const Icon = severity.icon;
  const keys = check.all.filter((k) => /^[A-Z][A-Z0-9_]+-\d+$/.test(k));
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Badge color={severity.color} variant="light" leftSection={<Icon size={12} />} style={{ flexShrink: 0 }}>
          {t.shell.health.severity[check.severity]}
        </Badge>
        <Text size="sm" fw={500}>
          {check.title}
          {check.count > 0 ? ` (${check.count})` : ''}
        </Text>
      </Group>
      <Text size="sm">{check.action}</Text>
      {check.examples.length > 0 && (
        <Text size="xs" c="dimmed" className="mono">
          {check.examples.join(', ')}
          {check.count > check.examples.length ? t.shell.health.andMore(check.count - check.examples.length) : ''}
        </Text>
      )}
      <Group gap="xs">
        {check.link && (
          <Anchor component={Link} to={check.link} size="sm">
            {t.shell.health.fixHere}
          </Anchor>
        )}
        {keys.length > 0 && <OpenInJira keys={keys} label={t.shell.health.fixInJira} />}
      </Group>
    </Stack>
  );
}

/**
 * RF-78: Jira hygiene problems that quietly skew the numbers — unestimated work, statuses outside
 * every column, sprints without dates, owners outside the team — each with who fixes it and where.
 */
export function HealthPanel({ boardIds }: { boardIds?: number[] } = {}) {
  const t = useT();
  const health = useHealthCheck(boardIds);
  if (health.isLoading) return <Loading rows={4} />;
  if (health.error) return <ErrorState error={health.error} />;
  const data = health.data;
  if (!data) return null;
  return (
    <Stack gap="md">
      {data.ok ? (
        <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />} title={t.shell.health.okTitle}>
          {t.shell.health.okBody}
        </Alert>
      ) : (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title={t.shell.health.problems(data.problems)}>
          {t.shell.health.problemsBody}
        </Alert>
      )}
      <Accordion multiple defaultValue={data.items.filter((i) => !i.ok).map((i) => String(i.board.id))} variant="separated">
        {data.items.map((item) => (
          <Accordion.Item key={item.board.id} value={String(item.board.id)}>
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={500}>{item.board.name}</Text>
                <Text size="xs" c="dimmed">
                  {item.board.space_name}
                </Text>
                {item.ok ? (
                  <Badge color="teal" variant="light" size="sm">
                    {t.shell.health.ok}
                  </Badge>
                ) : (
                  <Badge color="yellow" variant="light" size="sm">
                    {t.shell.health.points(item.checks.filter((c) => c.severity !== 'info').length)}
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {item.checks.length === 0 && <Text size="sm" c="dimmed">{t.shell.health.nothing}</Text>}
                {item.checks.map((check) => (
                  <Check key={check.id} check={check} />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}
