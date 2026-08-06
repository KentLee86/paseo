import { create } from "zustand";
import type { LightboxSource } from "@/components/lightbox/source";

/**
 * The lightbox lives in one place, not in whichever component opened it.
 *
 * Assistant images sit inside a virtualized timeline: a lightbox owned by a message row is torn
 * down the moment that row scrolls out of the window list, taking the full-screen overlay with it.
 * A single store also makes two lightboxes at once unrepresentable.
 *
 * Not persisted — a lightbox open across a reload is not a state worth restoring.
 */
interface LightboxStoreState {
  source: LightboxSource | null;
  open: (source: LightboxSource) => void;
  close: () => void;
}

export const useLightboxStore = create<LightboxStoreState>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}));

/** Subscribes to the action only, so trigger components do not re-render when it opens. */
export function useOpenLightbox(): (source: LightboxSource) => void {
  return useLightboxStore((state) => state.open);
}
