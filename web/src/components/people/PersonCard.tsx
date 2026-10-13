import { Anchor, Avatar, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router';

import type { PersonIndicators, PlanRole } from '../../api/types';
import { RoleChip } from '../epicPlan/shared';
import { PersonIndicatorBlocks } from './indicators';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join('')
    .toUpperCase();

export interface CardRole {
  role: PlanRole;
  suffix?: string;
}

/**
 * A collectible-card look for a person — a coloured edge, a "type" chip, a few stat blocks — and,
 * deliberately, nothing but numbers: no ticket, story or task is listed on it. Those are one click
 * away, on the person's page, which is what the whole card links to.
 *
 * The edge takes the colour of the person's first role; it is that role's identity (its name is on
 * the card too), not a grade.
 */
export function PersonCard({
  to,
  name,
  roles,
  indicators,
}: {
  to: string;
  name: string;
  roles: CardRole[];
  indicators?: PersonIndicators;
}) {
  const edge = roles[0]?.role.cor ?? 'var(--border-soft)';
  return (
    // A card, not a link: the name is the link, and its stretched ::after covers the whole card. The "i"s
    // are buttons, so they cannot sit inside an anchor; they lift above the stretched link instead.
    <Paper withBorder className="person-card pk-card" style={{ borderTop: `4px solid ${edge}` }}>
      <Stack gap="sm" h="100%">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Avatar radius="xl" color="petrol" variant="light" aria-hidden>
            {initials(name)}
          </Avatar>
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={600} lineClamp={1}>
              <Anchor component={Link} to={to} className="stretched-link" underline="never" c="inherit">
                {name}
              </Anchor>
            </Text>
            {/* One row, always: the first role, and the rest behind "+n", so every card's header is as
                tall as the next and the numbers below line up across a row of cards. */}
            <Group gap={4} wrap="nowrap" style={{ minHeight: 24, minWidth: 0 }}>
              {roles[0] && <RoleChip role={roles[0].role} suffix={roles[0].suffix} truncate />}
              {roles.length > 1 && (
                <Tooltip label={roles.slice(1).map((r) => `${r.role.nome}${r.suffix ? ` · ${r.suffix}` : ''}`).join(', ')} multiline w={240}>
                  <Badge variant="default" size="sm" style={{ flex: '0 0 auto' }}>
                    +{roles.length - 1}
                  </Badge>
                </Tooltip>
              )}
              {roles.length === 0 && (
                <Text size="xs" c="dimmed">
                  sem função
                </Text>
              )}
            </Group>
          </Stack>
        </Group>

        {!indicators ? (
          <Text size="sm" c="dimmed" my="md" ta="center">
            Sem itens nem sprints nos boards acompanhados.
          </Text>
        ) : (
          <PersonIndicatorBlocks indicators={indicators} layout="card" />
        )}
      </Stack>
    </Paper>
  );
}
