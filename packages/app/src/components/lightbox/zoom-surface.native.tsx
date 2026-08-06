import { useMemo } from "react";
import { Image as ExpoImage } from "expo-image";
import type { ZoomSurfaceProps } from "./zoom-surface.types";

/**
 * Native zoom surface. Pinch/pan is not wired yet — this keeps the pre-existing fit-to-screen
 * behaviour so iOS and Android are unchanged while the web surface lands.
 */
export function ZoomSurface({ uri, alt, onError }: ZoomSurfaceProps) {
  const source = useMemo(() => ({ uri }), [uri]);
  return (
    <ExpoImage
      testID="attachment-lightbox-image"
      accessibilityLabel={alt}
      source={source}
      contentFit="contain"
      onError={onError}
      style={imageFillStyle}
    />
  );
}

const imageFillStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;
