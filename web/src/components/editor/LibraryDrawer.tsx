import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Image,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPencil, IconSearch, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { plural } from '../../lib/format';
import { useAssetLibrary, useBlocks, useDeleteBlock, useSaveBlock, useUpdateAsset } from '../../api/deckHooks';
import type { DeckBlock, LibraryAsset, ShapeEdit } from '../../api/types';
import { emuToCm } from '../../lib/emu';
import { ErrorState } from '../common';

/**
 * #16, #17: what can be dropped onto a slide — the pictures uploaded before (searchable by name,
 * label and tag) and blocks, a set of shapes saved once and reused on any slide of any template.
 */
export function LibraryDrawer({
  opened,
  onClose,
  selection,
  onInsertImage,
  onInsertBlock,
}: {
  opened: boolean;
  onClose: () => void;
  /** The current selection as insertable shapes; empty disables "save as block". */
  selection: Record<string, ShapeEdit>;
  onInsertImage: (asset: LibraryAsset) => void;
  onInsertBlock: (block: DeckBlock) => void;
}) {
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg" title="Biblioteca">
      <Tabs defaultValue="imagens" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="imagens">Imagens</Tabs.Tab>
          <Tabs.Tab value="blocos">Blocos</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="imagens">
          <Images onInsert={onInsertImage} />
        </Tabs.Panel>
        <Tabs.Panel value="blocos">
          <Blocks selection={selection} onInsert={onInsertBlock} />
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}

function Images({ onInsert }: { onInsert: (asset: LibraryAsset) => void }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [debounced] = useDebouncedValue(query, 250);
  const assets = useAssetLibrary(debounced, tag ?? '');
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Stack gap="sm">
      <Group grow>
        <TextInput
          placeholder="buscar por nome ou rótulo"
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Select placeholder="etiqueta" data={assets.data?.tags ?? []} value={tag} onChange={setTag} clearable />
      </Group>
      {assets.isLoading && <Loader size="sm" />}
      {assets.error && <ErrorState error={assets.error} />}
      {assets.data && !assets.data.items.length && (
        <Text size="sm" c="dimmed">
          Nenhuma imagem{query || tag ? ' com esse filtro' : ''}. Envie uma pela barra do editor e ela aparece aqui.
        </Text>
      )}
      <SimpleGrid cols={2} spacing="sm">
        {assets.data?.items.map((asset) =>
          editing === asset.id ? (
            <AssetEditor key={asset.id} asset={asset} tags={assets.data?.tags ?? []} onDone={() => setEditing(null)} />
          ) : (
            <Card key={asset.id} withBorder padding="xs">
              <Card.Section>
                <Image src={asset.url} alt={asset.label || asset.filename} h={110} fit="contain" bg="var(--mantine-color-gray-0)" />
              </Card.Section>
              <Stack gap={4} mt={6}>
                <Group justify="space-between" wrap="nowrap" gap={4}>
                  <Text size="xs" fw={500} lineClamp={1}>
                    {asset.label || asset.filename}
                  </Text>
                  <Tooltip label="Rótulo e etiquetas">
                    <ActionIcon size="xs" variant="subtle" onClick={() => setEditing(asset.id)} aria-label="Editar rótulo">
                      <IconPencil size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Group gap={2}>
                  {asset.tags.map((t) => (
                    <Badge key={t} size="xs" variant="light">
                      {t}
                    </Badge>
                  ))}
                </Group>
                <Button size="compact-xs" variant="light" onClick={() => onInsert(asset)}>
                  Inserir no slide
                </Button>
              </Stack>
            </Card>
          ),
        )}
      </SimpleGrid>
    </Stack>
  );
}

function AssetEditor({ asset, tags, onDone }: { asset: LibraryAsset; tags: string[]; onDone: () => void }) {
  const update = useUpdateAsset();
  const [label, setLabel] = useState(asset.label);
  const [chosen, setChosen] = useState(asset.tags);
  return (
    <Card withBorder padding="xs">
      <Stack gap={6}>
        <TextInput size="xs" label="Rótulo" value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        <TagsInput size="xs" label="Etiquetas" data={tags} value={chosen} onChange={setChosen} />
        {update.error && <ErrorState error={update.error} />}
        <Group gap={4} justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={onDone}>
            Cancelar
          </Button>
          <Button size="compact-xs" loading={update.isPending} onClick={() => update.mutate({ id: asset.id, label, tags: chosen }, { onSuccess: onDone })}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function Blocks({ selection, onInsert }: { selection: Record<string, ShapeEdit>; onInsert: (block: DeckBlock) => void }) {
  const blocks = useBlocks();
  const save = useSaveBlock();
  const remove = useDeleteBlock();
  const [name, setName] = useState('');
  const count = Object.keys(selection).length;
  return (
    <Stack gap="sm">
      <Card withBorder padding="sm">
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Salvar a seleção como bloco
          </Text>
          <Text size="xs" c="dimmed">
            {count
              ? `${count === 1 ? '1 elemento selecionado' : `${count} elementos selecionados`}. O bloco guarda posição relativa, texto e formato; vínculos a dados não viajam.`
              : 'Selecione um ou mais elementos no slide para guardá-los como bloco.'}
          </Text>
          <Group gap={4} wrap="nowrap">
            <TextInput size="xs" placeholder="nome do bloco" value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} />
            <Button
              size="xs"
              disabled={!count || !name.trim()}
              loading={save.isPending}
              onClick={() => save.mutate({ name, shapes: selection }, { onSuccess: () => setName('') })}
            >
              Salvar
            </Button>
          </Group>
          {save.error && <ErrorState error={save.error} title="Bloco não salvo" />}
        </Stack>
      </Card>
      {blocks.isLoading && <Loader size="sm" />}
      {blocks.data && !blocks.data.items.length && (
        <Text size="sm" c="dimmed">
          Nenhum bloco salvo ainda.
        </Text>
      )}
      {blocks.data?.items.map((block) => (
        <Card key={block.id} withBorder padding="xs">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} lineClamp={1}>
                {block.name}
              </Text>
              <Text size="xs" c="dimmed">
                {plural(Object.keys(block.shapes).length, 'elemento', 'elementos')} · {emuToCm(block.width).toFixed(1)} × {emuToCm(block.height).toFixed(1)} cm
                {block.author ? ` · ${block.author}` : ''}
                {block.usage_count > 0 ? ` · ${plural(block.usage_count, 'uso', 'usos')}` : ''}
              </Text>
            </Stack>
            <Group gap={4} wrap="nowrap">
              <Button size="compact-xs" variant="light" onClick={() => onInsert(block)}>
                Inserir
              </Button>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove.mutate(block.id)} aria-label={`Apagar o bloco ${block.name}`}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
