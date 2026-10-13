import { ActionIcon, Badge, Group, Text } from '@mantine/core';
import { IconFlag, IconPencil } from '@tabler/icons-react';
import type { DragEvent } from 'react';

import { corDoSinal, corDoTema, type Documento, type EstiloLinha } from '../../lib/focusLog';

/** An ordinary line of the log: its text, the themes and signals it was filed under, and an edit button. */
export function TarefaCard({
  documento,
  texto,
  temas,
  tags,
  onEdit,
  draggable,
  onDragStart,
}: {
  documento: Documento;
  texto: string;
  temas: string[];
  tags: string[];
  onEdit: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <article className="tf-card" draggable={draggable} onDragStart={onDragStart}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap={4}>
        <Text size="sm" className="tf-card-text">
          {texto}
        </Text>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Editar atividade" onClick={onEdit}>
          <IconPencil size={13} />
        </ActionIcon>
      </Group>
      {(temas.length > 0 || tags.length > 0) && (
        <Group gap={4} mt={6} wrap="wrap">
          {/* Themes say what the work is about: filled, with the theme's colour as a dot. */}
          {temas.map((tema) => (
            <Badge
              key={`tema-${tema}`}
              size="xs"
              variant="light"
              color="gray"
              styles={{ root: { textTransform: 'none' } }}
              leftSection={<span className="tf-dot" style={{ background: corDoTema(documento, tema) }} aria-hidden />}
            >
              {tema}
            </Badge>
          ))}
          {/* Signals are conditions found in the text: outlined, with a flag, so they never read as a theme. */}
          {tags.map((tag) => (
            <Badge
              key={`sinal-${tag}`}
              size="xs"
              variant="outline"
              leftSection={<IconFlag size={10} stroke={2} aria-hidden />}
              styles={{ root: { textTransform: 'none', borderStyle: 'dashed', borderColor: corDoSinal(documento, tag), color: 'var(--mantine-color-text)' } }}
              aria-label={`Sinal: ${tag}`}
            >
              {tag}
            </Badge>
          ))}
        </Group>
      )}
    </article>
  );
}

/** A change of focus: the card that stands out in its lane, with its icon, the theme it leaves and the one it takes. */
export function TrocaCard({
  icone,
  cor,
  estilo,
  de,
  para,
  texto,
  onEdit,
  draggable,
  onDragStart,
}: {
  icone: string;
  cor: string;
  estilo: EstiloLinha;
  de: string;
  para: string;
  texto: string;
  onEdit?: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <article className={`tf-card tf-shift ${estilo}`} style={{ ['--shift-c' as string]: cor }} draggable={draggable} onDragStart={onDragStart}>
      <Group justify="space-between" wrap="nowrap" gap={4}>
        <Group gap={6} wrap="nowrap">
          <span aria-hidden className="tf-shift-icon">
            {icone}
          </span>
          <Badge size="xs" variant="filled" style={{ background: cor }}>
            Troca de foco
          </Badge>
        </Group>
        {onEdit && (
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Editar troca de foco" onClick={onEdit}>
            <IconPencil size={13} />
          </ActionIcon>
        )}
      </Group>
      <div className="tf-shift-route">
        <span>
          <b>De:</b> {de}
        </span>
        <span aria-hidden>➔</span>
        <span>
          <b>Para:</b> {para}
        </span>
      </div>
      {texto && (
        <Text size="xs" c="dimmed" mt={4} className="tf-card-text">
          {texto}
        </Text>
      )}
    </article>
  );
}
