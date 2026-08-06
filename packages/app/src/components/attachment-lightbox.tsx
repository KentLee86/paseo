import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { WindowChromeRootRegion, WindowChromeSafeArea } from "@/utils/desktop-window";
import type { LightboxSource } from "./lightbox/source";
import { ZoomSurface } from "./lightbox/zoom-surface";

interface AttachmentLightboxProps {
  source: LightboxSource | null;
  onClose: () => void;
}

export function AttachmentLightbox({ source, onClose }: AttachmentLightboxProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Resolved here rather than by the opener: this component holds the reference for as long as it
  // shows the image, so a blob URL cannot be revoked out from under it.
  const attachment = source?.kind === "attachment" ? source.metadata : null;
  const previewUrl = useAttachmentPreviewUrl(attachment);
  const url = source?.kind === "uri" ? source.uri : previewUrl;
  const [errored, setErrored] = useState(false);
  // Once the image is zoomed the backdrop stops closing: a drag that overshoots the image is a
  // pan that ran out of picture, not a click on the background.
  const [zoomed, setZoomed] = useState(false);

  const sourceKey = source?.kind === "attachment" ? source.metadata.id : (source?.uri ?? null);

  useEffect(() => {
    setErrored(false);
    setZoomed(false);
  }, [sourceKey]);

  useEffect(() => {
    if (!isWeb || !source) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [source, onClose]);

  const closeButtonRowStyle = useMemo(
    () => [styles.closeButtonRow, { top: insets.top + CHROME_INSET }],
    [insets.top],
  );
  const closeButtonStyle = useMemo(
    () => [styles.closeButton, { marginRight: insets.right + CHROME_INSET }],
    [insets.right],
  );

  const handleImageError = useCallback(() => setErrored(true), []);

  if (!source) {
    return null;
  }

  const hasError = errored || !url;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <WindowChromeRootRegion corners="both">
        <View style={styles.root}>
          <Pressable
            testID="attachment-lightbox-backdrop"
            accessibilityRole="button"
            accessibilityLabel={t("message.attachments.dismissImage")}
            onPress={zoomed ? undefined : onClose}
            disabled={zoomed}
            style={styles.backdrop}
          />
          <View style={styles.contentLayer}>
            <View style={styles.imageArea}>
              {hasError ? (
                <Text style={styles.errorText}>{t("message.attachments.imageLoadFailed")}</Text>
              ) : (
                <View testID="attachment-lightbox-viewport" style={styles.viewport}>
                  <ZoomSurface
                    uri={url}
                    alt={source.alt ?? attachment?.fileName ?? undefined}
                    onError={handleImageError}
                    onZoomedChange={setZoomed}
                  />
                </View>
              )}
            </View>
            <WindowChromeSafeArea placement="inline" style={closeButtonRowStyle}>
              <Pressable
                testID="attachment-lightbox-close"
                accessibilityRole="button"
                accessibilityLabel={t("message.attachments.closeImage")}
                hitSlop={8}
                onPress={onClose}
                style={closeButtonStyle}
              >
                <ThemedX size={16} uniProps={iconForegroundMutedMapping} />
              </Pressable>
            </WindowChromeSafeArea>
          </View>
        </View>
      </WindowChromeRootRegion>
    </Modal>
  );
}

const ThemedX = withUnistyles(X);
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** `theme.spacing[3]`, inlined so the safe-area offsets do not need a theme hook. */
const CHROME_INSET = 12;

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  contentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "box-none",
  },
  closeButtonRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    pointerEvents: "box-none",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    pointerEvents: "box-none",
  },
  /**
   * The viewport fills the modal rather than capping at a fixed size: a zoomable image that is
   * letterboxed into 960x640 wastes the screen the zoom exists to use.
   */
  viewport: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    overflow: "hidden",
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
}));
