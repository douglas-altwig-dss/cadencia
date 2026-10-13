import { Button, Popover, Select, Stack, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconCalendarWeek } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { usePeople } from '../../api/hooks';
import { useFilters } from '../../lib/filters';

/** The key under which this browser remembers who "me" is. */
export const ME_KEY = 'cadencia-minha-pessoa';

/**
 * RF-85: your own week in one click. Who you are is kept in this browser; the first time (or whenever it
 * is not known) a short picker asks, and the choice opens your week, the same Semana tab every person has.
 * ``startOpen`` is for ``?tab=minha-semana`` links: the same flow, started at once.
 */
export function MyWeekButton({ startOpen = false }: { startOpen?: boolean }) {
  const navigate = useNavigate();
  const { carry } = useFilters();
  const people = usePeople();
  const [me, setMe] = useLocalStorage<string | null>({ key: ME_KEY, defaultValue: null, getInitialValueInEffect: false });
  const [picking, setPicking] = useState(false);
  const options = (people.data?.items ?? [])
    .map((p) => ({ value: p.account_id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  const openWeek = (accountId: string) => navigate(carry(`/pessoas/${encodeURIComponent(accountId)}?tab=semana`));
  const press = () => (me ? openWeek(me) : setPicking(true));

  useEffect(() => {
    if (startOpen) press();
    // Only on arrival: a link with the tab opens once, not on every render.
  }, []);

  return (
    <Popover opened={picking} onChange={setPicking} position="bottom-end" withArrow shadow="md" trapFocus>
      <Popover.Target>
        <Button variant="default" size="xs" leftSection={<IconCalendarWeek size={14} />} onClick={press} aria-haspopup="dialog">
          Minha semana
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Select
            label="Quem é você?"
            description="A escolha fica guardada neste navegador."
            placeholder="Buscar pelo nome"
            data={options}
            value={me}
            onChange={(value) => {
              if (!value) return;
              setMe(value);
              setPicking(false);
              openWeek(value);
            }}
            searchable
            w={260}
            nothingFoundMessage="Ninguém com esse nome nos boards acompanhados"
          />
          {!options.length && <Text size="xs" c="dimmed">A lista vem dos responsáveis pelos itens dos boards acompanhados.</Text>}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
