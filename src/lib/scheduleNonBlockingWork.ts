/**
 * Thay cho InteractionManager.runAfterInteractions (deprecated trên RN mới).
 * Ưu tiên requestIdleCallback; fallback setTimeout(0).
 */
export type NonBlockingTask = { cancel: () => void };

export function scheduleNonBlockingWork(fn: () => void, idleTimeoutMs = 500): NonBlockingTask {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };

  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(run, { timeout: idleTimeoutMs });
    return {
      cancel: () => {
        cancelled = true;
        g.cancelIdleCallback?.(id);
      },
    };
  }

  const id = setTimeout(run, 0);
  return {
    cancel: () => {
      cancelled = true;
      clearTimeout(id);
    },
  };
}
