import { Badge, Group, Text, Title, Tooltip } from '@mantine/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import type { EpicPlanView, PlanRole, PlanStatus } from '../../api/types';
import { t as messages, useT } from '../../i18n';
import { bestText } from '../../lib/contrast';
import { InfoTip } from '../common';
import { fmtNum } from '../../lib/format';

// Section 8's texts that belong to the page live in the `epicPlan.tips` catalogue; the algorithm
// ones come from the API's registry.

/** A catalogue sentence with `**bold**` parts, drawn with the bold kept inside the one sentence. */
export function rich(text: string): ReactNode {
  return text.split('**').map((part, index) => (index % 2 ? <b key={index}>{part}</b> : part));
}

export const hours = (value: number | null | undefined) => `${fmtNum(value, 2)}h`;

export type RoleIndex = Map<number, PlanRole>;

export const roleIndex = (view: Pick<EpicPlanView, 'papeis'>): RoleIndex => new Map(view.papeis.map((r) => [r.id, r]));

/** Text colour that reads on a role's fill (the colour itself never carries meaning alone). */
export const onColor = (hex: string) => `#${bestText(hex).color}`;

/**
 * A role's colour always travels with its name: the chip is tinted and edged in the colour, but
 * its text stays the page's text colour, so a pale yellow role reads in both themes.
 */
export function RoleChip({
  role,
  suffix,
  floating,
  truncate = false,
}: {
  role: PlanRole;
  suffix?: string;
  floating?: boolean;
  /** One line with an ellipsis (the full name is the tooltip): for a card, where every row must be the same height. */
  truncate?: boolean;
}) {
  return (
    <Badge
      title={truncate ? `${role.nome}${suffix ? ` · ${suffix}` : ''}` : undefined}
      variant="outline"
      radius="sm"
      size="sm"
      tt="none"
      fw={500}
      styles={{
        root: {
          borderColor: role.cor,
          borderLeftWidth: 4,
          background: `color-mix(in srgb, ${role.cor} 16%, var(--mantine-color-body))`,
          color: 'var(--mantine-color-text)',
          height: 'auto',
          minHeight: 20,
          maxWidth: '100%',
          // In a one-row header the chip has to be allowed to shrink below its text, or it pushes the row wider.
          ...(truncate ? { minWidth: 0, flexShrink: 1 } : {}),
        },
        // Wrap instead of ellipsis: the role name is the one thing the chip must always say.
        label: truncate
          ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25, paddingBlock: 2 }
          : { whiteSpace: 'normal', overflow: 'visible', lineHeight: 1.25, paddingBlock: 2 },
      }}
      rightSection={floating ? <FloatingMark /> : undefined}
    >
      {role.nome}
      {suffix ? ` · ${suffix}` : ''}
    </Badge>
  );
}

export function FloatingMark() {
  const t = useT();
  return (
    <Tooltip label={t.epicPlan.tips.floating} multiline w={280} withArrow>
      <span aria-label={t.epicPlan.floatingAria} style={{ display: 'inline-flex', cursor: 'help' }}>
        <IconArrowsExchange size={12} />
      </span>
    </Tooltip>
  );
}

export { InfoTip };

/** One section of the plan: a title the index points at, one line saying what it answers, then it. */
export function PlanSection({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="plan-section">
      <Group justify="space-between" align="flex-end" mb="md" gap="sm">
        <div>
          <Title order={3} id={`${id}-titulo`}>
            {title}
          </Title>
          {description && (
            <Text size="sm" c="dimmed" mt={2} maw={760}>
              {description}
            </Text>
          )}
        </div>
        {actions}
      </Group>
      {children}
    </section>
  );
}

const STATUS_COLOR: Record<PlanStatus, string> = {
  otimo: 'teal',
  viavel: 'yellow',
  sem_solucao: 'red',
  heuristico: 'gray',
  invalido: 'red',
};

/** Status of a generated plan. "Ótimo" means optimality was proven; "Viável" carries its gap. */
export function StatusBadge({ status, gap }: { status: PlanStatus; gap: number | null }) {
  const t = useT();
  const label = t.epicPlan.status[status];
  const text = status === 'viavel' && gap !== null ? t.epicPlan.statusWithGap(label, fmtNum(gap * 100, 1)) : label;
  return (
    <Badge variant="light" color={STATUS_COLOR[status]} tt="none">
      {text}
    </Badge>
  );
}

export function gainText(days: number): { text: string; good: boolean } {
  const gain = messages().epicPlan.gain;
  if (days > 0) return { text: gain.faster(days), good: true };
  if (days === 0) return { text: gain.same, good: false };
  return { text: gain.slower(-days), good: false };
}

export function Dimmed({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="dimmed">
      {children}
    </Text>
  );
}
