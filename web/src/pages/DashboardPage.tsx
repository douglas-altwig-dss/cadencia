import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconLayoutDashboard, IconPlus, IconRestore } from '@tabler/icons-react';
import { useState } from 'react';

import { ApiError } from '../api/client';
import { useMosaic } from '../api/homeHooks';
import { useDashboard } from '../api/hooks';
import { Empty, ExportMenu, PageHeader } from '../components/common';
import { CatalogDrawer } from '../components/home/CatalogDrawer';
import { MosaicGrid, MosaicSkeleton } from '../components/home/MosaicGrid';
import { useT } from '../i18n';

/**
 * The Home page is a mosaic: tiles of indicators about the boards, the people and what is happening,
 * arranged and sized by whoever is looking. The arrangement is kept in Cadência's own database, per
 * signed-in user — never in Jira — and changes are saved as they are made.
 */
export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { mosaic, isLoading: loadingLayout, saving, shared, customised, update, reset } = useMosaic();
  const [editing, setEditing] = useState(false);
  const [catalog, { open, close }] = useDisclosure(false);
  const t = useT();
  const m = t.tracking.dashboard;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          editing ? (
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={open}>
                {m.addOrRemove}
              </Button>
              <Button size="xs" variant="default" leftSection={<IconRestore size={14} />} disabled={!customised} onClick={() => void reset()}>
                {m.restoreDefault}
              </Button>
              <Button size="xs" onClick={() => setEditing(false)}>
                {m.done}
              </Button>
            </Group>
          ) : (
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconLayoutDashboard size={14} />} onClick={() => setEditing(true)}>
                {m.customise}
              </Button>
              <ExportMenu dataset="dashboard" params={{}} />
            </Group>
          )
        }
      />
      {isLoading && <MosaicSkeleton tiles={mosaic.tiles} />}
      {/* M27: the tiles read their own data, so one failing route leaves the rest of the mosaic in place. */}
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title={m.boardsUnavailable}>
          {error instanceof ApiError ? error.message : String(error)} {m.restBelow}
        </Alert>
      )}
      {data && data.rows.length === 0 && !error && (
        <Empty
          title={m.noBoardsTitle}
          action={{ label: m.gettingStarted, to: '/setup' }}
          secondary={{ label: m.chooseBoards, to: '/settings' }}
        >
          {m.noBoardsBody}
        </Empty>
      )}
      {!isLoading && (
        <Stack gap="sm">
          {editing && (
            <Alert variant="light" color="petrol" title={m.editingTitle}>
              <Text size="sm">
                {m.editingHint(saving)}
                {shared && ` ${m.editingShared}`}
              </Text>
            </Alert>
          )}
          {loadingLayout ? <MosaicSkeleton tiles={mosaic.tiles} /> : <MosaicGrid tiles={mosaic.tiles} editing={editing} onChange={(tiles) => update({ ...mosaic, tiles })} />}
          {mosaic.tiles.length === 0 && !loadingLayout && (
            <Empty title={m.emptyTitle} action={{ label: m.addIndicators, onClick: open }}>
              {m.emptyBody}
            </Empty>
          )}
        </Stack>
      )}
      <CatalogDrawer opened={catalog} onClose={close} tiles={mosaic.tiles} onChange={(tiles) => update({ ...mosaic, tiles })} />
    </>
  );
}
