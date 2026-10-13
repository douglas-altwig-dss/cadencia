import { Chip, Group, NumberInput, SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';

import type { DeckSchedule } from '../api/types';
import { TIMEZONES, WEEKDAYS } from '../lib/format';

export const DEFAULT_SCHEDULE: DeckSchedule = {
  enabled: false,
  weekdays: [4],
  hour: 10,
  minute: 0,
  timezone: 'America/Sao_Paulo',
  reference: 'agora',
  notify: true,
};

/**
 * RF-77: this template's own generation time. The boards' checkpoint is Friday 18:00; a deck for a
 * Friday 10:00 meeting has to exist before it. "Dados de agora" shows the state at generation time,
 * "último checkpoint" the week's frozen, official picture.
 */
export function ScheduleEditor({
  value,
  onChange,
  audiences = [],
}: {
  value?: DeckSchedule;
  onChange: (next: DeckSchedule) => void;
  audiences?: string[];
}) {
  const schedule = { ...DEFAULT_SCHEDULE, ...(value ?? {}) };
  const set = (patch: Partial<DeckSchedule>) => onChange({ ...schedule, ...patch });
  return (
    <Stack gap="xs">
      <Switch label="Gerar em horário próprio" checked={schedule.enabled} onChange={(e) => set({ enabled: e.currentTarget.checked })} />
      {schedule.enabled && (
        <>
          <Chip.Group multiple value={schedule.weekdays.map(String)} onChange={(v) => v.length && set({ weekdays: v.map(Number).sort() })}>
            <Group gap={4}>
              {WEEKDAYS.map((day, index) => (
                <Chip key={day} value={String(index)} size="xs">
                  {day.slice(0, 3)}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Group gap="xs" align="flex-end">
            <NumberInput label="Hora" size="xs" min={0} max={23} value={schedule.hour} onChange={(v) => set({ hour: Number(v) || 0 })} w={80} />
            <NumberInput label="Minuto" size="xs" min={0} max={59} step={5} value={schedule.minute} onChange={(v) => set({ minute: Number(v) || 0 })} w={80} />
            <Select label="Fuso" size="xs" data={TIMEZONES} value={schedule.timezone} onChange={(v) => v && set({ timezone: v })} searchable w={200} allowDeselect={false} />
          </Group>
          <SegmentedControl
            size="xs"
            value={schedule.reference}
            onChange={(v) => set({ reference: v as DeckSchedule['reference'] })}
            data={[
              { value: 'agora', label: 'Dados de agora' },
              { value: 'ultimo_checkpoint', label: 'Último checkpoint' },
            ]}
          />
          {audiences.length > 0 && (
            <Select
              label="Público"
              size="xs"
              placeholder="todos os slides"
              data={audiences}
              value={schedule.audience || null}
              onChange={(v) => set({ audience: v ?? '' })}
              clearable
              w={200}
            />
          )}
          <Text size="xs" c="dimmed">
            O serviço de coleta registra o horário em até 5 minutos depois de salvar o mapeamento.
          </Text>
        </>
      )}
      <Switch
        label="Avisar os canais ao gerar sozinho"
        description="vai para os canais de notificação que pedem “apresentação gerada” (Configuração → Notificações)"
        checked={schedule.notify}
        onChange={(e) => set({ notify: e.currentTarget.checked })}
      />
      {schedule.notify && (
        <Stack gap={4}>
          <Text size="sm">No e-mail, enviar</Text>
          <SegmentedControl
            size="xs"
            value={schedule.attach ?? 'link'}
            onChange={(v) => set({ attach: v as DeckSchedule['attach'] })}
            data={[
              { value: 'link', label: 'Só o link' },
              { value: 'pptx', label: 'Anexo .pptx' },
              { value: 'pdf', label: 'Anexo PDF' },
            ]}
          />
          <Text size="xs" c="dimmed">
            Slack e Teams recebem sempre o link. Arquivos acima de 20 MB, ou uma apresentação
            reprovada na validação, seguem só como link.
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
