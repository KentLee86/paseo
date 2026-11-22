import { useFileBytes, type PluginFilePanelProps } from "@getpaseo/plugin/client";
import { Buffer } from "buffer";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { FileHtmlPreview } from "../html-preview";
import { FilePanelLoading } from "../loading";
import { pdfPreviewDocument } from "./document";

export function PdfPanel({ file }: PluginFilePanelProps) {
  const state = useFileBytes(file);
  const bytes = state.status === "ready" ? state.bytes : null;
  const { t } = useTranslation();
  const html = useMemo(() => bytes && pdfPreviewDocument(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64"), {
    loading: t("panels.file.loading"), error: t("panels.file.pdf.error", { defaultValue: "PDF 열기 실패" }),
    previous: t("panels.file.pdf.previous", { defaultValue: "이전 페이지" }), next: t("panels.file.pdf.next", { defaultValue: "다음 페이지" }),
    zoomIn: t("message.diagram.zoomIn"), zoomOut: t("message.diagram.zoomOut"), retry: t("common.actions.retry"),
    fitWidth: t("panels.file.pdf.fitWidth", { defaultValue: "폭 맞춤" }), fitPage: t("panels.file.pdf.fitPage", { defaultValue: "페이지 맞춤" }),
  }), [bytes, t]);
  if (state.status === "error") return <Text>{state.error.message}</Text>;
  if (!html) return <FilePanelLoading />;
  return <FileHtmlPreview html={html} testID="file-pdf-preview" />;
}
