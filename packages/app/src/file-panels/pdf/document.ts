import { pdfRuntimeScript } from "./runtime.gen";

export interface PdfPreviewLabels {
  loading: string;
  error: string;
  previous: string;
  next: string;
  zoomIn: string;
  zoomOut: string;
  retry: string;
  fitWidth: string;
  fitPage: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

export function pdfPreviewDocument(base64: string, labels: PdfPreviewLabels): string {
  // PDF bytes enter markup only through the base64 alphabet.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("Invalid PDF base64 data");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
[hidden]{display:none!important}*{box-sizing:border-box}html,body{height:100%;overflow:hidden}
body{margin:0;font:14px system-ui;background:#eceef1;color:#222;display:flex;flex-direction:column}
nav{display:flex;align-items:center;gap:4px;padding:4px 6px;background:#fff;border-bottom:1px solid #d9dde3;flex-shrink:0;overflow-x:auto;white-space:nowrap}
button{flex-shrink:0;min-width:36px;min-height:40px;padding:4px 6px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:18px}
button:disabled{opacity:.35}button[aria-pressed="true"]{background:#e5efff;color:#155ab6}
#page-number,#zoom-label{font-variant-numeric:tabular-nums;min-width:42px;text-align:center;font-size:12px;flex-shrink:0}
#viewport{flex:1;min-height:0;overflow:auto;overflow-y:scroll;overscroll-behavior:contain;overflow-anchor:none;touch-action:pan-x pan-y}
#pages{position:relative}.pdf-page{position:absolute;background:#fff;overflow:hidden;box-shadow:0 1px 4px #0002}
canvas{display:block;width:100%;height:100%}.pdf-page span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666}
#status{padding:12px;white-space:pre-wrap}#retry{margin:12px;border:1px solid #bbb}
</style></head><body>
<nav aria-label="PDF">
<button id="previous" disabled title="${escapeHtml(labels.previous)}" aria-label="${escapeHtml(labels.previous)}">‹</button><span id="page-number"></span>
<button id="next" disabled title="${escapeHtml(labels.next)}" aria-label="${escapeHtml(labels.next)}">›</button>
<button id="fit-width" disabled aria-pressed="true" title="${escapeHtml(labels.fitWidth)}" aria-label="${escapeHtml(labels.fitWidth)}">↔</button>
<button id="fit-page" disabled aria-pressed="false" title="${escapeHtml(labels.fitPage)}" aria-label="${escapeHtml(labels.fitPage)}">▣</button>
<button id="zoom-out" disabled title="${escapeHtml(labels.zoomOut)}" aria-label="${escapeHtml(labels.zoomOut)}">−</button>
<span id="zoom-label"></span><button id="zoom-in" disabled title="${escapeHtml(labels.zoomIn)}" aria-label="${escapeHtml(labels.zoomIn)}">+</button>
</nav><p id="status" role="status" data-loading="${escapeHtml(labels.loading)}" data-error="${escapeHtml(labels.error)}">${escapeHtml(labels.loading)}</p>
<button id="retry" hidden>${escapeHtml(labels.retry)}</button><div id="viewport"><div id="pages"></div></div>
<script id="pdf-data" type="application/octet-stream">${base64}</script><script>${pdfRuntimeScript}</script>
</body></html>`;
}
