import { Accordion, Alert, Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { Link } from 'react-router';

import { plural } from '../lib/format';
import { useHealthCheck } from '../api/featureHooks';
import type { HealthCheck } from '../api/types';
import { ErrorState, Loading } from './common';
import { OpenInJira } from './OpenInJira';

const SEVERITY = {
  erro: { color: 'red', label: 'erro', icon: IconX },
  aviso: { color: 'yellow', label: 'aviso', icon: IconAlertTriangle },
  info: { color: 'gray', label: 'informação', icon: IconInfoCircle },
} as const;

function Check({ check }: { check: HealthCheck }) {
  const severity = SEVERITY[check.severity];
  const Icon = severity.icon;
  const keys = check.all.filter((k) => /^[A-Z][A-Z0-9_]+-\d+$/.test(k));
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Badge color={severity.color} variant="light" leftSection={<Icon size={12} />} style={{ flexShrink: 0 }}>
          {severity.label}
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
          {check.count > check.examples.length ? ` e mais ${check.count - check.examples.length}` : ''}
        </Text>
      )}
      <Group gap="xs">
        {check.link && (
          <Anchor component={Link} to={check.link} size="sm">
            Corrigir aqui
          </Anchor>
        )}
        {keys.length > 0 && <OpenInJira keys={keys} label="Corrigir no Jira" />}
      </Group>
    </Stack>
  );
}

/**
 * RF-78: Jira hygiene problems that quietly skew the numbers — unestimated work, statuses outside
 * every column, sprints without dates, owners outside the team — each with who fixes it and where.
 */
export function HealthPanel() {
  const health = useHealthCheck();
  if (health.isLoading) return <Loading rows={4} />;
  if (health.error) return <ErrorState error={health.error} />;
  const data = health.data;
  if (!data) return null;
  return (
    <Stack gap="md">
      {data.ok ? (
        <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />} title="Nada que distorça os números">
          Os boards acompanhados não têm erros nem avisos de higiene de dados.
        </Alert>
      ) : (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title={plural(data.problems, 'ponto de atenção', 'pontos de atenção')}>
          Nenhum destes impede a coleta, mas cada um deixa algum indicador menos confiável.
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
                    ok
                  </Badge>
                ) : (
                  <Badge color="yellow" variant="light" size="sm">
                    {plural(item.checks.filter((c) => c.severity !== 'info').length, 'ponto', 'pontos')}
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {item.checks.length === 0 && <Text size="sm" c="dimmed">Nada a apontar.</Text>}
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
