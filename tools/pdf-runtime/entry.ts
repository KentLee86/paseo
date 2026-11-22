import {
  getDocument,
  RenderingCancelledException,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
// Registers the inline worker fallback; the viewer makes no external requests.
// eslint-disable-next-line import/no-unassigned-import
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import {
  capturePdfAnchor,
  clampPdfZoom,
  fitPdfPageZoom,
  layoutPdfPages,
  pdfPageAtY,
  restorePdfAnchor,
  visiblePdfPages,
  PDF_PADDING,
  PDF_MIN_ZOOM,
  PDF_MAX_ZOOM,
  type PdfAnchor,
  type PdfLayout,
  type PdfPoint,
  type PdfSize,
} from "../../packages/app/src/file-panels/pdf/layout";

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing PDF control: ${id}`);
  return node;
}

const status = element("status", HTMLParagraphElement);
const previous = element("previous", HTMLButtonElement);
const next = element("next", HTMLButtonElement);
const zoomIn = element("zoom-in", HTMLButtonElement);
const zoomOut = element("zoom-out", HTMLButtonElement);
const fitWidth = element("fit-width", HTMLButtonElement);
const fitPage = element("fit-page", HTMLButtonElement);
const retry = element("retry", HTMLButtonElement);
const pageNumber = element("page-number", HTMLSpanElement);
const zoomLabel = element("zoom-label", HTMLSpanElement);
const viewport = element("viewport", HTMLDivElement);
const pagesContainer = element("pages", HTMLDivElement);
const payload = element("pdf-data", HTMLScriptElement);

interface PageView {
  host: HTMLDivElement;
  canvas: HTMLCanvasElement;
  placeholder: HTMLSpanElement;
  renderedScale: number | null;
  task: RenderTask | null;
}
let pdf: PDFDocumentProxy | null = null;
let sizes: PdfSize[] = [];
let views: PageView[] = [];
let layout: PdfLayout = { pages: [], width: 0, height: 0 };
let currentPage = 1;
let zoom = 1;
let fitMode: "width" | "page" | "custom" = "width";
let failed = false;
let revision = 0;
let rendering = false;
let renderRequested = false;
let renderTimer: ReturnType<typeof setTimeout>;
let lastViewport: PdfSize = { width: 0, height: 0 };
let readingAnchor: PdfAnchor | undefined;

function rememberReadingAnchor(): void {
  const current = viewportSize();
  // Hidden retained frames report zero scroll ranges. During resize, the DOM
  // also has new dimensions before the PDF layout does. Neither is a reading position.
  if (
    !sizes.length ||
    failed ||
    current.width <= 0 ||
    current.height <= 0 ||
    current.width !== lastViewport.width ||
    current.height !== lastViewport.height
  )
    return;
  readingAnchor = anchorAt(centerPoint());
}

function viewportSize(): PdfSize {
  return { width: viewport.clientWidth, height: viewport.clientHeight };
}
function centerPoint(): PdfPoint {
  return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
}
function anchorAt(point: PdfPoint): PdfAnchor {
  return capturePdfAnchor({
    layout,
    point,
    scroll: { x: viewport.scrollLeft, y: viewport.scrollTop },
  });
}
function updateControls(): void {
  const disabled = sizes.length === 0 || failed;
  previous.disabled = disabled || currentPage === 1;
  next.disabled = disabled || currentPage === sizes.length;
  zoomIn.disabled = disabled || zoom >= PDF_MAX_ZOOM;
  zoomOut.disabled = disabled || zoom <= PDF_MIN_ZOOM;
  fitWidth.disabled = disabled;
  fitPage.disabled = disabled;
  fitWidth.setAttribute("aria-pressed", String(fitMode === "width"));
  fitPage.setAttribute("aria-pressed", String(fitMode === "page"));
  pageNumber.textContent = sizes.length ? `${currentPage} / ${sizes.length}` : "";
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}
function updateCurrentPage(): void {
  if (!sizes.length || failed) return;
  currentPage =
    viewport.scrollTop <= 1
      ? 1
      : pdfPageAtY(
          layout,
          viewport.scrollTop + Math.min(viewport.clientHeight / 2, layout.height / 2),
        ) + 1;
  updateControls();
}
function showError(error: unknown): void {
  failed = true;
  document.body.dataset.pdfState = "error";
  pagesContainer.hidden = true;
  status.hidden = false;
  status.textContent = `${status.dataset.error} ${error instanceof Error ? error.message : String(error)}`;
  retry.hidden = false;
  updateControls();
}

function applyLayout(anchor?: PdfAnchor, point = centerPoint()): void {
  revision += 1;
  for (const view of views) view.task?.cancel();
  lastViewport = viewportSize();
  layout = layoutPdfPages({ sizes, viewportWidth: lastViewport.width, zoom });
  pagesContainer.style.width = `${layout.width}px`;
  pagesContainer.style.height = `${layout.height}px`;
  views.forEach((view, index) => {
    const box = layout.pages[index];
    Object.assign(view.host.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    view.host.dataset.state = "loading";
  });
  if (anchor) {
    const scroll = restorePdfAnchor({ layout, anchor, point, viewport: lastViewport });
    viewport.scrollLeft = scroll.x;
    viewport.scrollTop = scroll.y;
  }
  rememberReadingAnchor();
  updateCurrentPage();
  updateControls();
  scheduleRender();
}
function scheduleRender(): void {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    void renderVisiblePages();
  }, 100);
}

async function renderVisiblePages(): Promise<void> {
  renderRequested = true;
  if (rendering) return;
  rendering = true;
  try {
    while (renderRequested) {
      if (!pdf || failed || pinch) break;
      renderRequested = false;
      const pdfDocument = pdf;
      const version = revision;
      const selected = visiblePdfPages({
        layout,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.clientHeight,
      });
      const retained = new Set(selected);
      views.forEach((view, index) => {
        if (!retained.has(index)) {
          view.canvas.width = 0;
          view.canvas.height = 0;
          view.renderedScale = null;
          view.placeholder.hidden = false;
          view.host.dataset.state = "loading";
        }
      });
      for (const index of selected) {
        if (version !== revision) {
          renderRequested = true;
          break;
        }
        const view = views[index];
        const box = layout.pages[index];
        if (
          view.renderedScale === box.scale &&
          view.canvas.width * view.canvas.height <= 8_000_000 / selected.length
        ) {
          view.host.dataset.state = "ready";
          continue;
        }
        await renderPdfPage({
          pdfDocument,
          index,
          version,
          pixelBudget: 8_000_000 / selected.length,
        });
      }
    }
  } catch (error) {
    showError(error);
  } finally {
    rendering = false;
  }
}

interface RenderPdfPageInput {
  pdfDocument: PDFDocumentProxy;
  index: number;
  version: number;
  pixelBudget: number;
}
async function renderPdfPage(input: RenderPdfPageInput): Promise<void> {
  const view = views[input.index];
  const box = layout.pages[input.index];
  try {
    const page = await input.pdfDocument.getPage(input.index + 1);
    if (input.version !== revision) {
      renderRequested = true;
      return;
    }
    const pixels = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(input.pixelBudget / (box.width * box.height)),
    );
    view.canvas.width = Math.max(1, Math.floor(box.width * pixels));
    view.canvas.height = Math.max(1, Math.floor(box.height * pixels));
    view.task = page.render({
      canvas: view.canvas,
      viewport: page.getViewport({ scale: box.scale }),
      transform: [pixels, 0, 0, pixels, 0, 0],
    });
    await view.task.promise;
    if (input.version !== revision) {
      renderRequested = true;
      return;
    }
    page.cleanup();
    view.renderedScale = box.scale;
    view.placeholder.hidden = true;
    view.host.dataset.state = "ready";
    document.body.dataset.pdfState = "ready";
  } catch (error) {
    if (error instanceof RenderingCancelledException || input.version !== revision)
      renderRequested = true;
    else throw error;
  } finally {
    view.task = null;
  }
}

function changeZoom(input: {
  zoom: number;
  point?: PdfPoint;
  anchor?: PdfAnchor;
  deferRender?: boolean;
}): void {
  if (!sizes.length || failed) return;
  const point = input.point ?? centerPoint();
  const anchor = input.anchor ?? anchorAt(point);
  zoom = clampPdfZoom(input.zoom);
  fitMode = "custom";
  applyLayout(anchor, point);
  if (input.deferRender) clearTimeout(renderTimer);
}
function fit(mode: "width" | "page"): void {
  if (!sizes.length || failed) return;
  const page = currentPage - 1;
  zoom = mode === "width" ? 1 : fitPdfPageZoom({ page: sizes[page], viewport: viewportSize() });
  fitMode = mode;
  applyLayout();
  viewport.scrollLeft = 0;
  viewport.scrollTop = layout.pages[page].top - PDF_PADDING;
  currentPage = page + 1;
  updateControls();
}
function jumpPage(page: number): void {
  if (!sizes.length || failed) return;
  viewport.scrollTop = layout.pages[page - 1].top - PDF_PADDING;
  currentPage = page;
  updateControls();
  scheduleRender();
}
function toggleZoom(point: PdfPoint): void {
  changeZoom({ zoom: Math.abs(zoom - 1) < 0.05 ? 2 : 1, point });
  if (zoom === 1) {
    fitMode = "width";
    updateControls();
  }
}

async function loadDocument(): Promise<void> {
  retry.hidden = true;
  failed = false;
  revision += 1;
  for (const view of views) view.task?.cancel();
  const old = pdf;
  pdf = null;
  sizes = [];
  readingAnchor = undefined;
  views = [];
  pagesContainer.replaceChildren();
  pagesContainer.hidden = true;
  document.body.dataset.pdfState = "loading";
  status.hidden = false;
  status.textContent = status.dataset.loading ?? "";
  updateControls();
  try {
    if (old) await old.destroy();
    const bytes = Uint8Array.from(atob(payload.textContent ?? ""), (char) => char.charCodeAt(0));
    pdf = await getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: true,
      useWorkerFetch: false,
    }).promise;
    // Metadata reserves stable page heights; canvas pixels stay limited to nearby pages.
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const size = page.getViewport({ scale: 1 });
      sizes.push({ width: size.width, height: size.height });
      page.cleanup();
      const host = document.createElement("div");
      host.className = "pdf-page";
      host.dataset.page = String(index);
      host.setAttribute("aria-label", `PDF ${index}`);
      const canvas = document.createElement("canvas");
      canvas.width = 0;
      canvas.height = 0;
      const placeholder = document.createElement("span");
      placeholder.textContent = status.dataset.loading ?? "";
      host.append(canvas, placeholder);
      pagesContainer.append(host);
      views.push({ host, canvas, placeholder, renderedScale: null, task: null });
    }
    currentPage = 1;
    zoom = 1;
    fitMode = "width";
    status.hidden = true;
    pagesContainer.hidden = false;
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    applyLayout();
  } catch (error) {
    showError(error);
  }
}

previous.addEventListener("click", () => jumpPage(Math.max(1, currentPage - 1)));
next.addEventListener("click", () => jumpPage(Math.min(sizes.length, currentPage + 1)));
zoomIn.addEventListener("click", () => changeZoom({ zoom: zoom + 0.25 }));
zoomOut.addEventListener("click", () => changeZoom({ zoom: zoom - 0.25 }));
fitWidth.addEventListener("click", () => fit("width"));
fitPage.addEventListener("click", () => fit("page"));
retry.addEventListener("click", () => {
  void loadDocument();
});
viewport.addEventListener(
  "scroll",
  () => {
    rememberReadingAnchor();
    updateCurrentPage();
    scheduleRender();
  },
  { passive: true },
);
viewport.addEventListener("dblclick", (event) => {
  event.preventDefault();
  toggleZoom(localPoint(event.clientX, event.clientY));
});
viewport.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom({
      zoom: zoom * Math.exp(-event.deltaY * 0.002),
      point: localPoint(event.clientX, event.clientY),
    });
  },
  { passive: false },
);

function localPoint(clientX: number, clientY: number): PdfPoint {
  const box = viewport.getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top };
}
interface Pinch {
  distance: number;
  zoom: number;
  anchor: PdfAnchor;
}
let pinch: Pinch | null = null;
let tapStart: PdfPoint | null = null;
let lastTap: { point: PdfPoint; time: number } | null = null;
function touchPair(touches: TouchList): { point: PdfPoint; distance: number } {
  const a = touches[0];
  const b = touches[1];
  return {
    point: localPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  };
}
viewport.addEventListener(
  "touchstart",
  (event) => {
    if (!sizes.length || failed) return;
    if (event.touches.length === 2) {
      event.preventDefault();
      const pair = touchPair(event.touches);
      pinch = { distance: Math.max(1, pair.distance), zoom, anchor: anchorAt(pair.point) };
      tapStart = null;
      lastTap = null;
    } else if (event.touches.length === 1) {
      tapStart = localPoint(event.touches[0].clientX, event.touches[0].clientY);
    }
  },
  { passive: false },
);
viewport.addEventListener(
  "touchmove",
  (event) => {
    if (pinch && event.touches.length === 2) {
      event.preventDefault();
      const pair = touchPair(event.touches);
      changeZoom({
        zoom: (pinch.zoom * pair.distance) / pinch.distance,
        point: pair.point,
        anchor: pinch.anchor,
        deferRender: true,
      });
    } else if (tapStart && event.touches.length === 1) {
      const point = localPoint(event.touches[0].clientX, event.touches[0].clientY);
      if (Math.hypot(point.x - tapStart.x, point.y - tapStart.y) > 12) tapStart = null;
    }
  },
  { passive: false },
);
viewport.addEventListener(
  "touchend",
  (event) => {
    if (pinch) {
      pinch = null;
      tapStart = null;
      scheduleRender();
      return;
    }
    if (event.touches.length || !tapStart) return;
    const point = tapStart;
    tapStart = null;
    const time = performance.now();
    if (
      lastTap &&
      time - lastTap.time < 300 &&
      Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < 24
    ) {
      event.preventDefault();
      lastTap = null;
      toggleZoom(point);
    } else lastTap = { point, time };
  },
  { passive: false },
);
viewport.addEventListener("touchcancel", () => {
  pinch = null;
  tapStart = null;
  lastTap = null;
  scheduleRender();
});

let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const current = viewportSize();
    if (!sizes.length || failed || current.width <= 0 || current.height <= 0) return;
    const anchor =
      readingAnchor ?? anchorAt({ x: lastViewport.width / 2, y: lastViewport.height / 2 });
    if (fitMode === "page")
      zoom = fitPdfPageZoom({ page: sizes[anchor.page], viewport: viewportSize() });
    applyLayout(anchor);
  }, 100);
});
void loadDocument();
