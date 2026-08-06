import type { AttachmentMetadata } from "@/attachments/types";

/**
 * What the lightbox is showing.
 *
 * `attachment` is the safe form: the lightbox resolves the preview URL itself through
 * `useAttachmentPreviewUrl`, so it holds its own reference and the blob survives the opener
 * unmounting. Pass a raw `uri` only for sources that are not reference counted — `http(s):` and
 * native `file://`. Never hand a `blob:` URL through the `uri` form.
 */
export type LightboxSource =
  | { kind: "attachment"; metadata: AttachmentMetadata; alt?: string }
  | { kind: "uri"; uri: string; alt?: string };

export function attachmentLightboxSource(
  metadata: AttachmentMetadata,
  alt?: string,
): LightboxSource {
  return { kind: "attachment", metadata, alt };
}
