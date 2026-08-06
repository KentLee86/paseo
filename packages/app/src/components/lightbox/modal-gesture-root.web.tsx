import type { ReactNode } from "react";

/**
 * Web needs no gesture root: the web zoom surface listens to DOM events directly, and a modal here
 * lives in the same document rather than a separate window. Passing children straight through keeps
 * the web layout identical to what it was before the native root was introduced.
 */
export function ModalGestureRoot({ children }: { children: ReactNode }): ReactNode {
  return children;
}
