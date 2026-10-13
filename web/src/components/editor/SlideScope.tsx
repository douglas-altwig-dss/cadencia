import { Badge, Chip, Divider, Group, MultiSelect, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';

import type { DeckBoard, SlideMapping } from '../../api/types';

/**
 * RF-55: which spaces and boards a slide belongs to.
 *
 * The default is **included everywhere**, and it is a deliberate choice rather than a convenience:
 * empty lists are also what every mapping saved before scoping existed says, so one rule covers
 * both a brand-new slide and a five-sprint-old presentation — neither loses a slide because a
 * feature appeared. Narrowing a slide is therefore always something somebody did on purpose, which
 * is what makes the badge on the thumbnail worth trusting.
 */
export function SlideScope({
  mapping,
  boards,
  audiences = [],
  onChange,
}: {
  mapping: SlideMapping;
  boards: DeckBoard[];
  /** #25: the deck's declared audiences; a slide can be kept for some of them only. */
  audiences?: string[];
  onChange: (next: SlideMapping) => void;
}) {
  const onlySpaces = mapping.only_spaces ?? [];
  const onlyBoards = mapping.only_boards ?? [];
  const onlyAudiences = mapping.only_audiences ?? [];
  const everywhere = !(onlySpaces.length || onlyBoards.length);

  const spaceOptions = [
    ...new Map(boards.filter((b) => b.space_key).map((b) => [b.space_key!, b.space_name || b.space_key!])),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  // The board list follows the chosen spaces: a board outside them could never match anyway.
  const boardOptions = (onlySpaces.length ? boards.filter((b) => b.space_key && onlySpaces.includes(b.space_key)) : boards)
    .map((b) => ({ value: String(b.id), label: b.space_name ? `${b.name} · ${b.space_name}` : b.name }));

  return (
    <Stack gap="xs">
      <Group gap="xs" justify="space-between">
        <Switch
          size="xs"
          label="Em todos os espaços e boards"
          checked={everywhere}
          onChange={(event) =>
            onChange(
              event.currentTarget.checked
                ? { ...mapping, only_spaces: [], only_boards: [] }
                : { ...mapping, only_spaces: spaceOptions[0] ? [spaceOptions[0].value] : [], only_boards: [] },
            )
          }
        />
        {!everywhere && (
          <Badge size="xs" color="grape" variant="light">
            condicional
          </Badge>
        )}
      </Group>
      {everywhere ? (
        <Text size="xs" c="dimmed">
          Este slide sai para todos. Desligue para escolher quem o recebe.
        </Text>
      ) : (
        <>
          <MultiSelect
            size="xs"
            label="Só nestes espaços"
            placeholder="qualquer espaço"
            data={spaceOptions}
            value={onlySpaces}
            onChange={(value) =>
              onChange({
                ...mapping,
                only_spaces: value,
                only_boards: onlyBoards.filter((id) => {
                  const board = boards.find((b) => b.id === id);
                  return !value.length || (board?.space_key && value.includes(board.space_key));
                }),
              })
            }
            searchable
            clearable
          />
          <MultiSelect
            size="xs"
            label="Só nestes boards"
            placeholder="qualquer board do espaço"
            data={boardOptions}
            value={onlyBoards.map(String)}
            onChange={(value) => onChange({ ...mapping, only_boards: value.map(Number) })}
            searchable
            clearable
          />
          <Text size="xs" c="dimmed">
            Os dois filtros somam-se: com espaço e board preenchidos, o slide só sai para os boards
            escolhidos <b>dentro</b> desses espaços. Vazio quer dizer "qualquer".
          </Text>
        </>
      )}
      {(audiences.length > 0 || onlyAudiences.length > 0) && (
        <>
          <Divider />
          <Group gap="xs" justify="space-between">
            <Text size="xs" fw={500}>
              Públicos
            </Text>
            {onlyAudiences.length > 0 && (
              <Badge size="xs" color="grape" variant="light">
                só {onlyAudiences.join(', ')}
              </Badge>
            )}
          </Group>
          <Chip.Group multiple value={onlyAudiences} onChange={(value) => onChange({ ...mapping, only_audiences: value })}>
            <Group gap={4}>
              {[...new Set([...audiences, ...onlyAudiences])].map((audience) => (
                <Chip key={audience} value={audience} size="xs">
                  {audience}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Text size="xs" c="dimmed">
            Nenhum marcado: o slide sai para todos os públicos. Uma geração sem público escolhido
            inclui todos os slides.
          </Text>
        </>
      )}
      <Divider />
      <NumberInput
        size="xs"
        label="Minutos previstos na reunião"
        description="O cronômetro do modo apresentação avisa quando o slide passa disso."
        placeholder="sem limite"
        min={0}
        max={120}
        step={0.5}
        decimalScale={1}
        value={mapping.minutes ?? ''}
        onChange={(value) => onChange({ ...mapping, minutes: value === '' ? null : Number(value) })}
        w={220}
      />
      <Select
        size="xs"
        label="Transição ao entrar neste slide"
        description="Só no modo apresentação da Cadência; um arquivo baixado abre sem ela."
        data={[
          { value: 'nenhuma', label: 'Nenhuma' },
          { value: 'fade', label: 'Esmaecer' },
          { value: 'deslizar', label: 'Deslizar' },
        ]}
        value={mapping.transition ?? 'nenhuma'}
        onChange={(value) => value && onChange({ ...mapping, transition: value as SlideMapping['transition'] })}
        allowDeselect={false}
        w={220}
      />
    </Stack>
  );
}
