import { useEffect, useState } from "react";

/**
 * Turns a query on after a random delay so a crowd of phones does not hit
 * the database in the same instant. The delay is chosen once each time
 * `enabled` becomes true.
 */
export function useDeferredEnabled(enabled: boolean, spreadMs = 4000) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    const delay = Math.floor(Math.random() * spreadMs);
    const id = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(id);
  }, [enabled, spreadMs]);

  return enabled && ready;
}
