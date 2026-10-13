import { ActionIcon, Anchor, Badge, Box, Button, Group, Kbd, Loader, Modal, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDeviceDesktop,
  IconEraser,
  IconListSearch,
  IconMessage2,
  IconPencil,
  IconPointer,
  IconLayoutGrid,
  IconMaximize,
  IconNotes,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuestions } from '../api/deckHooks';
import { audienceUrl, channelName, issueKeys, supportsAudience, type Ink, type PresentMessage } from '../lib/presentChannel';
import { QuestionsPanel } from './deck/QuestionsPanel';
import { InkLayer, type InkTool } from './InkLayer';

export interface PresentSlide {
  key: string;
  /** A rendered image of the generated slide, when LibreOffice produced one. */
  image?: string;
  /** Drawn instead when there is no image: the canvas preview of the same slide. */
  render?: React.ReactNode;
  title: string;
  subtitle?: string;
  notes?: string;
  /** #26: minutes planned for this slide; the timer warns past it. */
  minutes?: number | null;
  /** #28: the slide's words, where issue keys are looked for. */
  text?: string;
  /** How Cadência's own presenter moves into this slide; a downloaded file has none of this. */
  transition?: 'nenhuma' | 'fade' | 'deslizar';
}

const NO_INK: Ink = { strokes: [], laser: null };

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (seconds: number) =>
  `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;

/**
 * RF-44: presenting from Cadência instead of only exporting a file.
 *
 * Arrows or space move, `g` opens the grid, `n` toggles the speaker notes, `f` goes full screen,
 * `Esc` leaves. The timer starts with the first slide, because the thing a presenter actually
 * needs on screen is how long they have been talking.
 */
export function PresentMode({
  slides,
  runId,
  opened,
  initial = 0,
  onClose,
  onRefresh,
  refreshing,
  onFinish,
}: {
  slides: PresentSlide[];
  /** Slides' audience Q&A lives against this run; omitted hides the "Perguntas" panel entirely. */
  runId?: string;
  opened: boolean;
  initial?: number;
  onClose: () => void;
  /** #27: redo the deck with today's numbers without leaving the presentation. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** #30: seconds spent on each slide (by key), reported once when the presentation ends. */
  onFinish?: (seconds: Record<string, number>) => void;
}) {
  const [index, setIndex] = useState(initial);
  const [showNotes, setShowNotes] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  // #26, #30: seconds on each slide, accumulated across visits; shown for the current one.
  const perSlide = useRef<Record<string, number>>({});
  const [onSlide, setOnSlide] = useState(0);
  // #29: the pen and the laser, per slide so going back shows what was drawn there.
  const [tool, setTool] = useState<InkTool>('none');
  const [inks, setInks] = useState<Record<string, Ink>>({});
  // #28
  const [showEvidence, setShowEvidence] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const questions = useQuestions(runId, opened);
  const pendingQuestions = (questions.data?.items ?? []).filter((q) => !q.answered_at).length;
  // RF-100: with an audience window open, this one becomes the presenter's view.
  const [audience, setAudience] = useState<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const total = slides.length;
  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(total - 1, 0))),
    [total],
  );

  useEffect(() => {
    if (opened) setIndex(Math.min(initial, Math.max(total - 1, 0)));
  }, [opened, initial, total]);

  const openAudience = useCallback(() => {
    if (!supportsAudience()) return;
    const id = Math.random().toString(36).slice(2, 10);
    window.open(audienceUrl(id), 'cadencia-plateia', 'popup,width=1280,height=720');
    setAudience(id);
    setShowNotes(true);
  }, []);

  const state = useCallback(
    (): PresentMessage => ({
      type: 'state',
      index,
      slides: slides.map((s) => ({ key: s.key, image: s.image, title: s.title })),
    }),
    [index, slides],
  );
  const latest = useRef(state);
  latest.current = state;
  const slideKey = slides[index]?.key;
  const ink = (slideKey && inks[slideKey]) || NO_INK;
  const latestKey = useRef(slideKey);
  latestKey.current = slideKey;
  const latestInk = useRef(ink);
  latestInk.current = ink;
  const setInk = useCallback(
    (next: Ink) => {
      if (!slideKey) return;
      setInks((all) => ({ ...all, [slideKey]: next }));
      channel.current?.postMessage({ type: 'ink', key: slideKey, ink: next } satisfies PresentMessage);
    },
    [slideKey],
  );

  useEffect(() => {
    if (!audience) return;
    const bc = new BroadcastChannel(channelName(audience));
    channel.current = bc;
    bc.onmessage = (event: MessageEvent<PresentMessage>) => {
      if (event.data.type === 'hello') {
        bc.postMessage(latest.current());
        const key = latestKey.current;
        if (key) bc.postMessage({ type: 'ink', key, ink: latestInk.current } satisfies PresentMessage);
      }
      else if (event.data.type === 'nav') go(event.data.delta);
    };
    return () => {
      bc.postMessage({ type: 'end' } satisfies PresentMessage);
      bc.close();
      channel.current = null;
    };
  }, [audience, go]);

  useEffect(() => {
    channel.current?.postMessage(state());
    // The laser belongs to the slide it was pointing at; a new slide starts without it.
    if (slideKey) channel.current?.postMessage({ type: 'ink', key: slideKey, ink: { ...latestInk.current, laser: null } } satisfies PresentMessage);
    setOnSlide(slideKey ? (perSlide.current[slideKey] ?? 0) : 0);
  }, [state, slideKey]);

  // Putting the laser down takes its dot away, here and on the projector.
  useEffect(() => {
    if (tool !== 'laser' && latestInk.current.laser) setInk({ ...latestInk.current, laser: null });
  }, [tool, setInk]);

  /** #30: report the time per slide once, then start over for the next presentation. */
  const finish = useCallback(() => {
    const spent = perSlide.current;
    perSlide.current = {};
    setInks({});
    setTool('none');
    if (onFinish && Object.values(spent).some((s) => s > 0)) onFinish(spent);
    onClose();
  }, [onClose, onFinish]);

  useEffect(() => {
    if (!opened) setAudience(null);
  }, [opened]);

  useEffect(() => {
    if (!opened || !running) return;
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
      const key = latestKey.current;
      if (key) {
        perSlide.current[key] = (perSlide.current[key] ?? 0) + 1;
        setOnSlide(perSlide.current[key]);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [opened, running]);

  useEffect(() => {
    if (!opened) return;
    const onKey = (event: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        ArrowRight: () => go(1),
        ArrowDown: () => go(1),
        PageDown: () => go(1),
        ' ': () => go(1),
        ArrowLeft: () => go(-1),
        ArrowUp: () => go(-1),
        PageUp: () => go(-1),
        Home: () => setIndex(0),
        End: () => setIndex(Math.max(total - 1, 0)),
        g: () => setShowGrid((v) => !v),
        n: () => setShowNotes((v) => !v),
        p: () => setRunning((v) => !v),
        s: () => (audience ? setAudience(null) : openAudience()),
        f: () => void stage.current?.requestFullscreen?.().catch(() => undefined),
        d: () => setTool((t) => (t === 'pen' ? 'none' : 'pen')),
        l: () => setTool((t) => (t === 'laser' ? 'none' : 'laser')),
        c: () => setInk(NO_INK),
        e: () => setShowEvidence((v) => !v),
        q: () => runId && setShowQuestions((v) => !v),
        Escape: () => (showGrid ? setShowGrid(false) : tool !== 'none' ? setTool('none') : finish()),
      };
      const action = keys[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened, go, total, audience, openAudience, setInk, tool, finish, showGrid, runId]);

  const slide = slides[index];
  const budget = slide?.minutes ? slide.minutes * 60 : null;
  const over = budget !== null && onSlide > budget;
  const keys = issueKeys(slide?.text ?? '');

  return (
    <Modal opened={opened} onClose={finish} fullScreen withCloseButton={false} closeOnEscape={false} padding={0} transitionProps={{ duration: 120 }}>
      <Box ref={stage} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-body)' }}>
        <Group justify="space-between" px="md" py="xs" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Badge variant="light">
              {total ? index + 1 : 0} / {total}
            </Badge>
            <Text fw={600} lineClamp={1}>
              {slide?.title ?? 'Sem slides'}
            </Text>
            {slide?.subtitle && (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {slide.subtitle}
              </Text>
            )}
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip label={running ? 'pausar o cronômetro (p)' : 'retomar (p)'}>
              <Button
                size="compact-sm"
                variant="subtle"
                className="mono"
                leftSection={running ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
                onClick={() => setRunning((v) => !v)}
              >
                {clock(seconds)}
              </Button>
            </Tooltip>
            {/* #26: this slide's own clock, against the minutes planned for it. */}
            <Tooltip label={budget !== null ? `previsto: ${clock(budget)}` : 'tempo neste slide'}>
              <Badge variant={over ? 'filled' : 'light'} color={over ? 'red' : 'gray'} className="mono">
                {over ? 'passou · ' : ''}
                {clock(onSlide)}
                {budget !== null ? ` / ${clock(budget)}` : ''}
              </Badge>
            </Tooltip>
            <Tooltip label="zerar o cronômetro">
              <ActionIcon variant="subtle" aria-label="Zerar o cronômetro" onClick={() => setSeconds(0)}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            {onRefresh && (
              <Tooltip label="gerar de novo com os números de agora">
                <Button size="compact-sm" variant="subtle" leftSection={refreshing ? <Loader size={12} /> : <IconRefresh size={14} />} disabled={refreshing} onClick={onRefresh}>
                  Atualizar números
                </Button>
              </Tooltip>
            )}
            <Tooltip label="caneta (d) · apagar (c)">
              <ActionIcon variant={tool === 'pen' ? 'filled' : 'subtle'} aria-label="Caneta" onClick={() => setTool((t) => (t === 'pen' ? 'none' : 'pen'))}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="laser (l)">
              <ActionIcon variant={tool === 'laser' ? 'filled' : 'subtle'} aria-label="Laser" onClick={() => setTool((t) => (t === 'laser' ? 'none' : 'laser'))}>
                <IconPointer size={16} />
              </ActionIcon>
            </Tooltip>
            {ink.strokes.length > 0 && (
              <Tooltip label="apagar os traços deste slide (c)">
                <ActionIcon variant="subtle" aria-label="Apagar traços" onClick={() => setInk(NO_INK)}>
                  <IconEraser size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={keys.length ? `itens citados neste slide (e)` : 'nenhum item citado neste slide'}>
              <ActionIcon variant={showEvidence ? 'filled' : 'subtle'} aria-label="Evidências" onClick={() => setShowEvidence((v) => !v)}>
                <IconListSearch size={16} />
              </ActionIcon>
            </Tooltip>
            {runId && (
              <Tooltip label="perguntas da plateia">
                <ActionIcon variant={showQuestions ? 'filled' : 'subtle'} aria-label="Perguntas" style={{ position: 'relative' }} onClick={() => setShowQuestions((v) => !v)}>
                  <IconMessage2 size={16} />
                  {pendingQuestions > 0 && (
                    <Badge size="xs" circle color="red" style={{ position: 'absolute', top: -4, right: -4 }}>
                      {pendingQuestions}
                    </Badge>
                  )}
                </ActionIcon>
              </Tooltip>
            )}
            {supportsAudience() && (
              <Tooltip label={audience ? 'fechar a tela da plateia (s)' : 'abrir a tela da plateia em outra janela (s)'}>
                <Button
                  size="compact-sm"
                  variant={audience ? 'filled' : 'subtle'}
                  leftSection={<IconDeviceDesktop size={14} />}
                  onClick={() => (audience ? setAudience(null) : openAudience())}
                >
                  {audience ? 'Duas telas' : 'Tela da plateia'}
                </Button>
              </Tooltip>
            )}
            <Tooltip label="notas do apresentador (n)">
              <ActionIcon variant={showNotes ? 'filled' : 'subtle'} aria-label="Notas do apresentador" onClick={() => setShowNotes((v) => !v)}>
                <IconNotes size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="todos os slides (g)">
              <ActionIcon variant={showGrid ? 'filled' : 'subtle'} aria-label="Todos os slides" onClick={() => setShowGrid((v) => !v)}>
                <IconLayoutGrid size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="tela cheia (f)">
              <ActionIcon variant="subtle" aria-label="Tela cheia" onClick={() => void stage.current?.requestFullscreen?.().catch(() => undefined)}>
                <IconMaximize size={16} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon variant="subtle" color="red" aria-label="Sair da apresentação" onClick={finish}>
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Group>

        {audience && (
          <Box style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', gap: 16, padding: 16 }}>
            <Stack gap={6} style={{ minHeight: 0 }}>
              <Text size="xs" c="dimmed">
                Na tela da plateia agora
              </Text>
              {slide?.image ? (
                <InkLayer ink={ink} tool={tool} onInk={setInk}>
                  <img src={slide.image} alt={slide.title} style={{ width: '100%', border: '1px solid var(--mantine-color-default-border)' }} />
                </InkLayer>
              ) : (
                <Paper withBorder p="xl">
                  <Text>{slide?.title}</Text>
                </Paper>
              )}
            </Stack>
            <Stack gap="sm" style={{ minHeight: 0 }}>
              <Text className="mono" fz={36} fw={600} aria-label="Tempo de apresentação">
                {clock(seconds)}
              </Text>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  A seguir
                </Text>
                {slides[index + 1]?.image ? (
                  <img src={slides[index + 1].image} alt={slides[index + 1].title} style={{ width: '60%', border: '1px solid var(--mantine-color-default-border)' }} />
                ) : (
                  <Text size="sm">{slides[index + 1]?.title ?? 'Fim da apresentação'}</Text>
                )}
              </Stack>
              <Paper withBorder p="sm" style={{ flex: 1, minHeight: 0 }}>
                <ScrollArea h="100%">
                  <Text size="lg" style={{ whiteSpace: 'pre-wrap' }} c={slide?.notes ? undefined : 'dimmed'}>
                    {slide?.notes || 'Sem notas neste slide.'}
                  </Text>
                </ScrollArea>
              </Paper>
              <Group grow>
                <Button variant="default" onClick={() => go(-1)} disabled={index === 0} leftSection={<IconChevronLeft size={16} />}>
                  Anterior
                </Button>
                <Button onClick={() => go(1)} disabled={index >= total - 1} rightSection={<IconChevronRight size={16} />}>
                  Próximo
                </Button>
              </Group>
            </Stack>
          </Box>
        )}
        <Box style={{ flex: 1, minHeight: 0, display: audience ? 'none' : 'flex' }}>
          <Box
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--mantine-spacing-md)',
              position: 'relative',
            }}
          >
            <ActionIcon
              size="xl"
              variant="subtle"
              aria-label="Slide anterior"
              disabled={index === 0}
              onClick={() => go(-1)}
              style={{ position: 'absolute', left: 8, zIndex: 2 }}
            >
              <IconChevronLeft size={28} />
            </ActionIcon>
            <Box
              key={slide?.key}
              className={slide?.transition && slide.transition !== 'nenhuma' ? `cadencia-transition-${slide.transition}` : undefined}
              style={{ width: '100%', maxWidth: 'calc((100vh - 160px) * 16 / 9)', maxHeight: '100%' }}
            >
              {slide?.image ? (
                <InkLayer ink={ink} tool={tool} onInk={setInk}>
                  <img src={slide.image} alt={slide.title} style={{ width: '100%', display: 'block', border: '1px solid var(--mantine-color-default-border)' }} />
                </InkLayer>
              ) : (
                (slide?.render ?? (
                  <Text c="dimmed" ta="center">
                    Nada para mostrar.
                  </Text>
                ))
              )}
            </Box>
            <ActionIcon
              size="xl"
              variant="subtle"
              aria-label="Próximo slide"
              disabled={index >= total - 1}
              onClick={() => go(1)}
              style={{ position: 'absolute', right: 8, zIndex: 2 }}
            >
              <IconChevronRight size={28} />
            </ActionIcon>
          </Box>

          {showEvidence && (
            <Paper withBorder w={280} radius={0} p="md" style={{ borderTop: 0, borderBottom: 0, borderRight: 0 }}>
              <Stack gap="xs" h="100%">
                <Text fw={600} size="sm">
                  Itens citados neste slide
                </Text>
                {keys.length ? (
                  <ScrollArea style={{ flex: 1 }}>
                    <Stack gap={4}>
                      {keys.map((key) => (
                        <Anchor key={key} href={`/issues/${encodeURIComponent(key)}`} target="_blank" rel="noopener" size="sm" className="mono">
                          {key}
                        </Anchor>
                      ))}
                    </Stack>
                  </ScrollArea>
                ) : (
                  <Text size="sm" c="dimmed">
                    Nenhuma chave de item neste slide.
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  Abre o histórico do item na Cadência numa aba nova — a evidência por trás do número, se alguém perguntar.
                </Text>
              </Stack>
            </Paper>
          )}
          {showQuestions && runId && (
            <Paper withBorder w={320} radius={0} p="md" style={{ borderTop: 0, borderBottom: 0, borderRight: 0 }}>
              <QuestionsPanel runId={runId} live />
            </Paper>
          )}
          {showNotes && (
            <Paper withBorder w={320} radius={0} p="md" style={{ borderTop: 0, borderBottom: 0, borderRight: 0 }}>
              <Stack gap="xs" h="100%">
                <Text fw={600} size="sm">
                  Notas do apresentador
                </Text>
                <ScrollArea style={{ flex: 1 }}>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }} c={slide?.notes ? undefined : 'dimmed'}>
                    {slide?.notes || 'Sem notas neste slide.'}
                  </Text>
                </ScrollArea>
                {index + 1 < total && (
                  <Paper withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      A seguir
                    </Text>
                    <Text size="sm" lineClamp={2}>
                      {slides[index + 1].title}
                    </Text>
                  </Paper>
                )}
              </Stack>
            </Paper>
          )}
        </Box>

        <Group justify="center" gap="xs" py={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Text size="xs" c="dimmed">
            <Kbd>←</Kbd> <Kbd>→</Kbd> navegar · <Kbd>g</Kbd> todos os slides · <Kbd>n</Kbd> notas · <Kbd>s</Kbd> tela da plateia · <Kbd>d</Kbd> caneta · <Kbd>l</Kbd> laser · <Kbd>e</Kbd> evidências · <Kbd>f</Kbd> tela cheia · <Kbd>Esc</Kbd> sair
          </Text>
        </Group>
      </Box>

      <Modal opened={showGrid} onClose={() => setShowGrid(false)} title="Ir para o slide" size="xl">
        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {slides.map((item, position) => (
            <Paper
              key={item.key}
              withBorder
              p={4}
              component="button"
              onClick={() => {
                setIndex(position);
                setShowGrid(false);
              }}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                borderColor: position === index ? 'var(--mantine-primary-color-filled)' : undefined,
                borderWidth: position === index ? 2 : 1,
                background: 'transparent',
              }}
            >
              <Stack gap={4}>
                {item.image ? (
                  <img src={item.image} alt="" style={{ width: '100%', display: 'block' }} />
                ) : (
                  <Box style={{ aspectRatio: '16 / 9', background: 'var(--mantine-color-default-hover)' }} />
                )}
                <Text size="xs" lineClamp={1}>
                  {position + 1}. {item.title}
                </Text>
              </Stack>
            </Paper>
          ))}
        </Box>
      </Modal>
    </Modal>
  );
}
