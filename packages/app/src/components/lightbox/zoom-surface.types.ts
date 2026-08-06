/**
 * The zoomable image surface inside the lightbox.
 *
 * Web and native use different libraries because gesture handling does not survive the crossing:
 * react-native-gesture-handler does not deliver pinch or wheel on react-native-web, so every
 * RN zoom library loses mouse zoom in the browser and Electron. The web build uses
 * react-zoom-pan-pinch (DOM wheel/drag/double-click) and native uses react-native-zoom-toolkit.
 *
 * Both implementations own only the transform. The modal, the backdrop, and the close button live
 * in `attachment-lightbox.tsx` so the chrome is written once.
 */
export interface ZoomSurfaceProps {
  /** Resolved preview URL — `blob:` on web, `file://` on native, or a direct `http(s):` source. */
  uri: string;
  alt?: string;
  onError: () => void;
  /**
   * Called when the user zooms in or back out to fit. The lightbox uses this to stop the backdrop
   * from closing on a drag that was meant to pan.
   */
  onZoomedChange?: (zoomed: boolean) => void;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
/** Scale a double click/tap jumps to when the image is at fit. */
export const DOUBLE_TAP_SCALE = 2;
