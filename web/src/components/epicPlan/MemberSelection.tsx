import { Button, Checkbox, Chip, Group, Stack, Text } from '@mantine/core';

import { useSetSelection } from '../../api/planHooks';
import type { EpicPlanView } from '../../api/types';
import { useT } from '../../i18n';

/**
 * Who is available for this epic. One selection, stored on the server and shared by the capacity
 * and planning sections: unticking someone in either changes both.
 */
export function MemberSelection({ view, layout }: { view: EpicPlanView; layout: 'chips' | 'list' }) {
  const t = useT();
  const m = t.epicPlan.members;
  const setSelection = useSetSelection(view.epico.key);
  const available = view.membros.filter((m) => m.ativo && m.papeis.length > 0);
  const hidden = view.membros.length - available.length;
  const selected = view.selecao;
  const change = (ids: string[]) => setSelection.mutate(available.map((m) => m.id).filter((id) => ids.includes(id)));

  const header = (
    <Group justify="space-between" gap="xs">
      <div>
        <Text size="xs" fw={700} tt="uppercase">
          {m.title}
        </Text>
        <Text size="xs" c="dimmed">
          {m.hint}
        </Text>
      </div>
      <Group gap={4}>
        <Button size="compact-xs" variant="subtle" onClick={() => change(available.map((m) => m.id))}>
          {m.all}
        </Button>
        <Button size="compact-xs" variant="subtle" onClick={() => change([])}>
          {m.none}
        </Button>
      </Group>
    </Group>
  );
  const footer =
    hidden > 0 ? (
      <Text size="xs" c="dimmed">
        {m.hidden(hidden)}
      </Text>
    ) : null;

  if (available.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {m.nobody}
      </Text>
    );
  }
  if (layout === 'chips') {
    return (
      <Stack gap="xs">
        {header}
        <Chip.Group multiple value={selected} onChange={change}>
          <Group gap="xs">
            {available.map((m) => (
              <Chip key={m.id} value={m.id} size="sm" variant="light">
                {m.nome}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        {footer}
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      {header}
      <Checkbox.Group value={selected} onChange={change}>
        <Stack gap={6}>
          {available.map((m) => (
            <Checkbox key={m.id} value={m.id} label={m.nome} />
          ))}
        </Stack>
      </Checkbox.Group>
      {footer}
    </Stack>
  );
}
