import { useEffect, useState } from 'react';

const EVENT = 'cadencia:announce';

/**
 * RF-95: say it out loud. Saving, a finished collection, a restored version — things that change
 * on screen without the focus moving — are announced through one polite live region, so a screen
 * reader hears them without the page stealing focus.
 */
export function announce(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

export function Announcer() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      // Clearing first makes a repeated message ("salvo", "salvo") be read again.
      setMessage('');
      window.setTimeout(() => setMessage(text), 50);
    };
    window.addEventListener(EVENT, onAnnounce);
    return () => window.removeEventListener(EVENT, onAnnounce);
  }, []);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
