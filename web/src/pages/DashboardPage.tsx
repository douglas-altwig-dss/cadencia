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

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle="Boards, pessoas e o que está acontecendo, do jeito que você quer olhar."
        actions={
          editing ? (
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={open}>
                Adicionar ou tirar
              </Button>
              <Button size="xs" variant="default" leftSection={<IconRestore size={14} />} disabled={!customised} onClick={() => void reset()}>
                Restaurar o padrão
              </Button>
              <Button size="xs" onClick={() => setEditing(false)}>
                Concluir
              </Button>
            </Group>
          ) : (
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconLayoutDashboard size={14} />} onClick={() => setEditing(true)}>
                Personalizar
              </Button>
              <ExportMenu dataset="dashboard" params={{}} />
            </Group>
          )
        }
      />
      {isLoading && <MosaicSkeleton tiles={mosaic.tiles} />}
      {/* M27: the tiles read their own data, so one failing route leaves the rest of the mosaic in place. */}
      {error && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} title="Indicadores dos boards indisponíveis">
          {error instanceof ApiError ? error.message : String(error)} As demais partes do painel seguem abaixo.
        </Alert>
      )}
      {data && data.rows.length === 0 && !error && (
        <Empty
          title="Nenhum board acompanhado ainda"
          action={{ label: 'Primeiros passos', to: '/inicio' }}
          secondary={{ label: 'Escolher boards em Configuração', to: '/configuracao' }}
        >
          O painel mostra os boards escolhidos depois da primeira coleta. O guia de primeiros passos conecta o Jira, escolhe os
          boards e roda a coleta, nessa ordem.
        </Empty>
      )}
      {!isLoading && (
        <Stack gap="sm">
          {editing && (
            <Alert variant="light" color="petrol" title="Montando o painel">
              <Text size="sm">
                Arraste um tile para outro lugar, escolha o tamanho (P, M ou G) ou use as setas para mover pelo teclado. Tudo é salvo sozinho
                {saving ? ' (salvando…)' : ''}.
                {shared && ' Sem login, este painel é o mesmo para todo mundo que abrir esta instalação.'}
              </Text>
            </Alert>
          )}
          {loadingLayout ? <MosaicSkeleton tiles={mosaic.tiles} /> : <MosaicGrid tiles={mosaic.tiles} editing={editing} onChange={(tiles) => update({ ...mosaic, tiles })} />}
          {mosaic.tiles.length === 0 && !loadingLayout && (
            <Empty title="O painel está vazio" action={{ label: 'Adicionar indicadores', onClick: open }}>
              Escolha os indicadores que quer ver por aqui.
            </Empty>
          )}
        </Stack>
      )}
      <CatalogDrawer opened={catalog} onClose={close} tiles={mosaic.tiles} onChange={(tiles) => update({ ...mosaic, tiles })} />
    </>
  );
}
