import { AspectRatio, Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconFileTypePpt, IconSettings, IconUpload } from '@tabler/icons-react';

import { useTemplatePreviews } from '../../api/hooks';
import type { TemplateSummary } from '../../api/types';
import { plural } from '../../lib/format';

const previewUrl = (templateId: number, name: string) => `/api/reports/templates/${templateId}/previews/${name}`;

/** One card's own thumbnail — a separate component so each fetches (and, the first time, renders)
 * its own preview independently, without blocking the rest of the gallery. */
function Thumbnail({ item }: { item: TemplateSummary }) {
  const previews = useTemplatePreviews(item.missing_file ? undefined : item.id);
  const image = previews.data?.images?.[0];
  return (
    <AspectRatio ratio={16 / 9} style={{ background: 'var(--surface-sunken, var(--mantine-color-default))', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
      {item.missing_file ? (
        <Stack align="center" justify="center" gap={4}>
          <IconAlertTriangle size={24} color="var(--mantine-color-red-6)" />
          <Text size="xs" c="dimmed">
            arquivo ausente
          </Text>
        </Stack>
      ) : image ? (
        <img src={previewUrl(item.id, image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : previews.isLoading || previews.isFetching ? (
        <Stack align="center" justify="center" gap={6}>
          <Loader size="sm" />
          <Text size="xs" c="dimmed">
            gerando prévia…
          </Text>
        </Stack>
      ) : (
        <Stack align="center" justify="center" gap={4} style={{ width: '100%', minWidth: 0 }}>
          <IconFileTypePpt size={28} color="var(--mantine-color-dimmed)" />
          {previews.data?.reason && (
            <Text size="xs" c="dimmed" ta="center" px="xs" lineClamp={3} style={{ width: '100%', wordBreak: 'break-word' }}>
              {previews.data.reason}
            </Text>
          )}
        </Stack>
      )}
    </AspectRatio>
  );
}

function TemplateCard({ item, onSelect }: { item: TemplateSummary; onSelect: () => void }) {
  return (
    <UnstyledButton onClick={onSelect} style={{ textAlign: 'left', display: 'block', width: '100%' }}>
      <Card withBorder padding="xs">
        <Card.Section>
          <Thumbnail item={item} />
        </Card.Section>
        <Stack gap={4} mt="xs">
          <Text size="sm" fw={600} lineClamp={1}>
            {item.name}
          </Text>
          <Group gap={4}>
            <Text size="xs" c="dimmed">
              {plural(item.slides, 'slide', 'slides')}
            </Text>
            {item.has_mapping ? (
              <Badge size="xs" variant="light">
                mapeado
              </Badge>
            ) : (
              <Badge size="xs" variant="outline" color="gray">
                sem mapeamento
              </Badge>
            )}
            {item.runs > 0 && (
              <Badge size="xs" variant="outline">
                {plural(item.runs, 'geração', 'gerações')}
              </Badge>
            )}
          </Group>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}

/**
 * RF-104: a gallery to open a presentation from, the way both slide products start — instead of a
 * dropdown that already assumed you knew which template you wanted. Selecting a card is the same
 * "open this template" the dropdown used to do; `onManage` reaches the same `TemplatesDrawer` this
 * screen always had, for delete and diagnostics, so nothing about managing templates is lost, only
 * the assumption that picking one had to happen from a `<Select>` in the corner.
 */
export function TemplateGallery({
  items,
  onSelect,
  onManage,
  onUploadFile,
  uploading,
  uploadError,
}: {
  items: TemplateSummary[];
  onSelect: (id: number) => void;
  onManage: () => void;
  onUploadFile: (file: File) => void;
  uploading: boolean;
  uploadError?: unknown;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {plural(items.length, 'modelo', 'modelos')} — escolha um para abrir em modo de edição.
        </Text>
        <Button variant="default" size="xs" leftSection={<IconSettings size={14} />} onClick={onManage}>
          Gerenciar modelos
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 4 }} spacing="md">
        <UploadCard uploading={uploading} error={uploadError} onFile={onUploadFile} />
        {items.map((item) => (
          <TemplateCard key={item.id} item={item} onSelect={() => onSelect(item.id)} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

/** The gallery's own upload tile — kept apart from the card grid (an upload is not "open this
 * file") but visually the same row, matching the "new file" tile both slide products show. */
export function UploadCard({ uploading, error, onFile }: { uploading: boolean; error?: unknown; onFile: (file: File) => void }) {
  return (
    <Tooltip label="Enviar um novo modelo .pptx" position="bottom">
      <Card withBorder padding="xs" component="label" style={{ cursor: 'pointer', borderStyle: 'dashed' }}>
        <input
          type="file"
          accept=".pptx"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) onFile(file);
          }}
        />
        <Card.Section>
          <AspectRatio ratio={16 / 9} style={{ background: 'var(--surface-sunken, var(--mantine-color-default))', borderRadius: 'var(--mantine-radius-sm)' }}>
            <Stack align="center" justify="center" gap={6}>
              {uploading ? <Loader size="sm" /> : <IconUpload size={28} color="var(--mantine-color-dimmed)" />}
              <Text size="xs" c="dimmed">
                {uploading ? 'Enviando…' : 'Novo modelo'}
              </Text>
            </Stack>
          </AspectRatio>
        </Card.Section>
        {Boolean(error) && (
          <Text size="xs" c="red" mt={4}>
            Modelo recusado.
          </Text>
        )}
      </Card>
    </Tooltip>
  );
}
