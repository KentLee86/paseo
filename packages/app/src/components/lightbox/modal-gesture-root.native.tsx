import type { ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/**
 * Gesture root for content rendered inside a `Modal`.
 *
 * A Modal opens its own Android window and hit-testing restarts there (docs/floating-panels.md), so
 * the app-root `GestureHandlerRootView` in `app/_layout.tsx` does not reach inside it. Without this
 * second root every gesture in the modal is dropped — the zoom surface receives no pinch, pan or
 * tap at all.
 */
export function ModalGestureRoot({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={fillStyle}>{children}</GestureHandlerRootView>;
}

const fillStyle = { flex: 1 } as const;
