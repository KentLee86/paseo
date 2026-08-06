import { useLightboxStore } from "@/stores/lightbox-store";
import { AttachmentLightbox } from "../attachment-lightbox";

/**
 * The single mount point for the image lightbox. Lives in the app shell so an open lightbox
 * outlives the row, pane or message that opened it.
 */
export function LightboxHost() {
  const source = useLightboxStore((state) => state.source);
  const close = useLightboxStore((state) => state.close);
  return <AttachmentLightbox source={source} onClose={close} />;
}
