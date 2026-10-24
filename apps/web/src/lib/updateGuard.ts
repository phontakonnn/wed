/**
 * Shared "is the user in the middle of something?" flag.
 *
 * The editor owns the draft, the service worker owns the reload. Rather than
 * letting the update prompt guess, the editor reports whether an unsaved
 * change is pending and the prompt refuses to auto-reload while it is set.
 */

let pendingDraft = false;
const listeners = new Set<(pending: boolean) => void>();

export function setDraftPending(pending: boolean): void {
  if (pendingDraft === pending) return;
  pendingDraft = pending;
  for (const listener of [...listeners]) listener(pending);
}

export function hasDraftPending(): boolean {
  return pendingDraft;
}

export function subscribeDraftPending(listener: (pending: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type DraftFlush = () => Promise<void>;

let flushDraftHandler: DraftFlush | null = null;

/**
 * The editor registers its "save now" function here. The update prompt calls it
 * right before reloading so a pending draft is written first, never discarded.
 */
export function registerDraftFlush(handler: DraftFlush): () => void {
  flushDraftHandler = handler;
  return () => {
    if (flushDraftHandler === handler) flushDraftHandler = null;
  };
}

/** Best-effort save of any pending draft. Never throws. */
export async function flushDraft(): Promise<void> {
  if (!flushDraftHandler) return;
  try {
    await flushDraftHandler();
  } catch {
    // A failed save must not block the reload forever; the editor already
    // surfaces its own error toast in that case.
  }
}
