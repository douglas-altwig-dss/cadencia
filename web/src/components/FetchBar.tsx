import { useIsFetching } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * A thin bar under the header while a screen is loading its data for the first time: navigating
 * answers at once, instead of leaving the old page or a blank one until the numbers arrive. Only
 * queries with nothing to show count — a refresh of what is already on screen is silent — and it
 * waits a moment before appearing, so a fast answer never flashes it.
 */
export function FetchBar() {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined }) > 0;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), 200);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return shown ? <div className="fetch-bar" role="presentation" aria-hidden /> : null;
}
