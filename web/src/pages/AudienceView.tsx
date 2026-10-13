import { Center, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { InkLayer } from '../components/InkLayer';
import { channelName, type AudienceSlide, type Ink, type PresentMessage } from '../lib/presentChannel';

/**
 * RF-100: the window on the projector. It shows the current slide and nothing else — the notes,
 * the timer and the next slide stay on the presenter's screen. Arrow keys here still move the deck
 * (the clicker may be plugged into either machine's focus).
 */
export function AudienceView() {
  const [params] = useSearchParams();
  const id = params.get('canal') ?? '';
  const [slides, setSlides] = useState<AudienceSlide[]>([]);
  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  // #29: the presenter's pen and laser, per slide key.
  const [inks, setInks] = useState<Record<string, Ink>>({});
  const channel = useRef<BroadcastChannel | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !('BroadcastChannel' in window)) return;
    const bc = new BroadcastChannel(channelName(id));
    channel.current = bc;
    bc.onmessage = (event: MessageEvent<PresentMessage>) => {
      const message = event.data;
      if (message.type === 'state') {
        setSlides(message.slides);
        setIndex(message.index);
        setEnded(false);
      } else if (message.type === 'ink') {
        setInks((all) => ({ ...all, [message.key]: message.ink }));
      } else if (message.type === 'end') {
        setEnded(true);
      }
    };
    bc.postMessage({ type: 'hello' } satisfies PresentMessage);
    document.title = 'Cadência — plateia';
    return () => bc.close();
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[event.key];
      if (delta) {
        event.preventDefault();
        channel.current?.postMessage({ type: 'nav', delta } satisfies PresentMessage);
      } else if (event.key === 'f') {
        void stage.current?.requestFullscreen?.().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slide = slides[index];
  return (
    <div
      ref={stage}
      style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'none' }}
      onDoubleClick={() => void stage.current?.requestFullscreen?.().catch(() => undefined)}
    >
      {slide?.image && !ended ? (
        <InkLayer ink={inks[slide.key]}>
          <img src={slide.image} alt={slide.title} style={{ maxWidth: '100vw', maxHeight: '100vh', display: 'block' }} />
        </InkLayer>
      ) : (
        <Center>
          <Stack gap={4} align="center">
            <Text c="gray.4" size="lg">
              {ended ? 'Apresentação encerrada.' : slide ? slide.title : 'Aguardando o apresentador…'}
            </Text>
            {!ended && (
              <Text c="gray.6" size="sm">
                Clique duas vezes ou tecle f para tela cheia.
              </Text>
            )}
          </Stack>
        </Center>
      )}
    </div>
  );
}
