import { useCallback, useEffect, useRef } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  type ZoomSurfaceProps,
} from "./zoom-surface.types";

/**
 * Web and Electron zoom surface. Renders a raw `<img>` rather than an RN `Image` because
 * react-zoom-pan-pinch transforms a DOM subtree, and going through react-native-web here would
 * only add a wrapper whose layout has to be undone.
 */
export function ZoomSurface({ uri, alt, onError, onZoomedChange }: ZoomSurfaceProps) {
  const zoomedRef = useRef(false);
  const controlsRef = useRef<ReactZoomPanPinchRef | null>(null);

  const handleTransform = useCallback(
    (_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
      const zoomed = state.scale > MIN_SCALE + ZOOMED_EPSILON;
      if (zoomed === zoomedRef.current) {
        return;
      }
      zoomedRef.current = zoomed;
      onZoomedChange?.(zoomed);
    },
    [onZoomedChange],
  );

  // The library binds wheel, drag and double click itself; keyboard is ours. Esc stays with the
  // lightbox, so it is deliberately not handled here.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const controls = controlsRef.current;
      if (!controls || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        controls.zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        controls.zoomOut();
      } else if (event.key === "0") {
        // Instant, not animated: the library queues an align-to-bounds pass ~100ms after a wheel
        // gesture, and that pass cancels an in-flight reset animation, stranding the image at
        // whatever scale it had reached.
        controls.resetTransform(0);
      } else {
        return;
      }
      event.preventDefault();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  return (
    <TransformWrapper
      ref={controlsRef}
      minScale={MIN_SCALE}
      maxScale={MAX_SCALE}
      centerOnInit
      limitToBounds
      // Without this the library multiplies the step by the raw wheel delta, so one notch of a
      // mouse wheel (deltaY 100-400) lands on max zoom. Step-per-notch is what a wheel means.
      smooth={false}
      doubleClick={doubleClickOptions}
      wheel={wheelOptions}
      onTransform={handleTransform}
    >
      <TransformComponent wrapperStyle={fillStyle} contentStyle={fillStyle}>
        <img
          data-testid="attachment-lightbox-image"
          src={uri}
          alt={alt ?? ""}
          onError={onError}
          draggable={false}
          style={imageStyle}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}

/** Scale is float; a wheel tick that lands on 1.0000001 must not read as zoomed. */
const ZOOMED_EPSILON = 0.01;

const doubleClickOptions = { mode: "toggle", step: DOUBLE_TAP_SCALE - MIN_SCALE } as const;
const wheelOptions = { step: 0.2 } as const;

const fillStyle = { width: "100%", height: "100%" } as const;

const imageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  userSelect: "none",
} as const;
