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

import { useAssetLibrary, useBlocks, useDeleteBlock, useSaveBlock, useUpdateAsset } from '../../api/deckHooks';
import type { DeckBlock, LibraryAsset, ShapeEdit } from '../../api/types';
import { emuToCm } from '../../lib/emu';
import { fmtNum } from '../../lib/format';
import { ErrorState } from '../common';
import { useT } from '../../i18n';

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
  const t = useT();
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg" title={t.editor.library.title}>
      <Tabs defaultValue="images" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="images">{t.editor.library.images}</Tabs.Tab>
          <Tabs.Tab value="blocks">{t.editor.library.blocks}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="images">
          <Images onInsert={onInsertImage} />
        </Tabs.Panel>
        <Tabs.Panel value="blocks">
          <Blocks selection={selection} onInsert={onInsertBlock} />
        </Tabs.Panel>
      </Tabs>
    </Drawer>
  );
}

function Images({ onInsert }: { onInsert: (asset: LibraryAsset) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [debounced] = useDebouncedValue(query, 250);
  const assets = useAssetLibrary(debounced, tag ?? '');
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Stack gap="sm">
      <Group grow>
        <TextInput
          placeholder={t.editor.library.searchPlaceholder}
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Select placeholder={t.editor.library.tagPlaceholder} data={assets.data?.tags ?? []} value={tag} onChange={setTag} clearable />
      </Group>
      {assets.isLoading && <Loader size="sm" />}
      {assets.error && <ErrorState error={assets.error} />}
      {assets.data && !assets.data.items.length && (
        <Text size="sm" c="dimmed">
          {query || tag ? t.editor.library.noImagesFiltered : t.editor.library.noImages}
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
                  <Tooltip label={t.editor.library.labelAndTags}>
                    <ActionIcon size="xs" variant="subtle" onClick={() => setEditing(asset.id)} aria-label={t.editor.library.editLabelAria}>
                      <IconPencil size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Group gap={2}>
                  {asset.tags.map((tag) => (
                    <Badge key={tag} size="xs" variant="light">
                      {tag}
                    </Badge>
                  ))}
                </Group>
                <Button size="compact-xs" variant="light" onClick={() => onInsert(asset)}>
                  {t.editor.library.insertOnSlide}
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
  const t = useT();
  const update = useUpdateAsset();
  const [label, setLabel] = useState(asset.label);
  const [chosen, setChosen] = useState(asset.tags);
  return (
    <Card withBorder padding="xs">
      <Stack gap={6}>
        <TextInput size="xs" label={t.editor.library.label} value={label} onChange={(e) => setLabel(e.currentTarget.value)} />
        <TagsInput size="xs" label={t.editor.library.tags} data={tags} value={chosen} onChange={setChosen} />
        {update.error && <ErrorState error={update.error} />}
        <Group gap={4} justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={onDone}>
            {t.editor.library.cancel}
          </Button>
          <Button size="compact-xs" loading={update.isPending} onClick={() => update.mutate({ id: asset.id, label, tags: chosen }, { onSuccess: onDone })}>
            {t.editor.library.save}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function Blocks({ selection, onInsert }: { selection: Record<string, ShapeEdit>; onInsert: (block: DeckBlock) => void }) {
  const t = useT();
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
            {t.editor.library.saveSelection}
          </Text>
          <Text size="xs" c="dimmed">
            {count ? t.editor.library.selected(count) : t.editor.library.selectFirst}
          </Text>
          <Group gap={4} wrap="nowrap">
            <TextInput size="xs" placeholder={t.editor.library.namePlaceholder} value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} />
            <Button
              size="xs"
              disabled={!count || !name.trim()}
              loading={save.isPending}
              onClick={() => save.mutate({ name, shapes: selection }, { onSuccess: () => setName('') })}
            >
              {t.editor.library.save}
            </Button>
          </Group>
          {save.error && <ErrorState error={save.error} title={t.editor.library.notSaved} />}
        </Stack>
      </Card>
      {blocks.isLoading && <Loader size="sm" />}
      {blocks.data && !blocks.data.items.length && (
        <Text size="sm" c="dimmed">
          {t.editor.library.noBlocks}
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
                {t.editor.library.elements(Object.keys(block.shapes).length)} · {fmtNum(emuToCm(block.width))} × {fmtNum(emuToCm(block.height))} cm
                {block.author ? ` · ${block.author}` : ''}
                {block.usage_count > 0 ? ` · ${t.editor.library.uses(block.usage_count)}` : ''}
              </Text>
            </Stack>
            <Group gap={4} wrap="nowrap">
              <Button size="compact-xs" variant="light" onClick={() => onInsert(block)}>
                {t.editor.library.insert}
              </Button>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => remove.mutate(block.id)} aria-label={t.editor.library.deleteAria(block.name)}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
