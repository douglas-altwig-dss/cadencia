import { useEffect } from 'react';

const CONTAINER = '.mantine-TableScrollContainer-scrollContainer';

/** Whether there is more to scroll to on each side of a table container; the CSS draws a shade for it. */
function mark(root: Element) {
  const viewport = root.querySelector('.mantine-ScrollArea-viewport');
  if (!viewport) return;
  const most = viewport.scrollWidth - viewport.clientWidth;
  root.toggleAttribute('data-more-left', viewport.scrollLeft > 1);
  root.toggleAttribute('data-more-right', most > 1 && viewport.scrollLeft < most - 1);
}

/**
 * Tells every horizontally scrolling table which of its edges still has content behind it, so a
 * table wider than its card looks scrollable instead of cut off. One listener for the whole app
 * (scroll events do not bubble, so it listens in the capture phase) rather than one per table.
 */
export function useScrollHints() {
  useEffect(() => {
    const sweep = () => document.querySelectorAll(CONTAINER).forEach(mark);
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sweep);
    };
    const onScroll = (event: Event) => {
      const root = event.target instanceof Element ? event.target.closest(CONTAINER) : null;
      if (root) mark(root);
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', later);
    // A table appearing, or the content of one changing width, needs a look too.
    const observer = new MutationObserver(later);
    observer.observe(document.body, { childList: true, subtree: true });
    sweep();
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', later);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
}
