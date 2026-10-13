import { Alert, Badge, Box, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconLink, IconLock } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { useSharedDeck } from '../api/deckHooks';
import { DeckViewer } from '../components/deck/DeckViewer';
import { fmtDate } from '../lib/format';
import { loadDeckFonts } from '../lib/fonts';

/**
 * #14: a deck opened from a read-only link — no sign-in, no menus, nothing to click but slides.
 * The token in the address is the only credential, so this page asks the public API and nothing
 * else; a revoked or expired link reads the same as one that never existed.
 */
export function SharedDeckPage() {
  const token = useParams().token;
  const deck = useSharedDeck(token);

  useEffect(() => {
    if (deck.data) void loadDeckFonts(deck.data.fonts, '/api/public/fonts');
  }, [deck.data]);

  // Shared links are opened by people who never saw the app: the tab says what they are looking at.
  const template = deck.data?.template;
  useEffect(() => {
    document.title = template ? `${template} · Cadência` : 'Cadência';
  }, [template]);

  return (
    <Box component="main" aria-labelledby="shared-deck-title" mih="100vh" py="xl" style={{ background: 'var(--app-bg)' }}>
      <Container size="lg">
        <Stack gap="lg">
          <Group gap="sm">
            <span className="brand-mark" aria-hidden>
              <IconLink size={16} />
            </span>
            <Text fw={700}>Cadência</Text>
            <Badge variant="default" leftSection={<IconLock size={12} />}>
              somente leitura
            </Badge>
          </Group>
          {deck.isLoading && (
            <Group role="status">
              <Loader size="sm" aria-hidden />
              <Text size="sm">Abrindo a apresentação…</Text>
            </Group>
          )}
          {deck.error && (
            <Alert color="yellow" variant="light" title="Este link não abre mais">
              O link pode ter expirado ou sido revogado. Peça um novo a quem o enviou.
            </Alert>
          )}
          {deck.data && (
            <>
              <div>
                <Title order={2} id="shared-deck-title">
                  {deck.data.template || 'Apresentação'}
                </Title>
                <Text c="dimmed" size="sm">
                  Referência {fmtDate(deck.data.reference_at, true)}
                  {deck.data.boards.length ? ` · ${deck.data.boards.join(', ')}` : ''}
                </Text>
              </div>
              <DeckViewer
                scene={deck.data.scene}
                maxHeight={620}
                raster={(index) => {
                  const name = deck.data!.images[index - 1];
                  return name ? `/api/public/decks/${token}/files/${encodeURIComponent(name)}` : undefined;
                }}
              />
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
