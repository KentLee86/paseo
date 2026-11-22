export interface PdfSize {
  width: number;
  height: number;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfPageBox extends PdfSize {
  top: number;
  left: number;
  scale: number;
}

export interface PdfLayout {
  pages: PdfPageBox[];
  width: number;
  height: number;
}

export interface PdfAnchor {
  page: number;
  x: number;
  y: number;
}

export const PDF_PADDING = 12;
export const PDF_PAGE_GAP = 12;
export const PDF_MIN_ZOOM = 0.1;
export const PDF_MAX_ZOOM = 5;

export function clampPdfZoom(zoom: number): number {
  return Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, zoom));
}

// Zoom is relative to fit-width, so mixed page sizes fill the same reading column.
export function layoutPdfPages(input: {
  sizes: PdfSize[];
  viewportWidth: number;
  zoom: number;
}): PdfLayout {
  const pageWidth = Math.max(1, input.viewportWidth - PDF_PADDING * 2) * input.zoom;
  const width = Math.max(input.viewportWidth, pageWidth + PDF_PADDING * 2);
  let top = PDF_PADDING;
  const pages = input.sizes.map((size) => {
    const scale = pageWidth / size.width;
    const height = size.height * scale;
    const box = { width: pageWidth, height, left: (width - pageWidth) / 2, top, scale };
    top += height + PDF_PAGE_GAP;
    return box;
  });
  return { pages, width, height: Math.max(0, top - PDF_PAGE_GAP + PDF_PADDING) };
}

export function fitPdfPageZoom(input: { page: PdfSize; viewport: PdfSize }): number {
  const width = Math.max(1, input.viewport.width - PDF_PADDING * 2);
  const height = Math.max(1, input.viewport.height - PDF_PADDING * 2);
  return Math.min(1, height / ((input.page.height / input.page.width) * width));
}

export function pdfPageAtY(layout: PdfLayout, y: number): number {
  let lower = 0;
  let upper = layout.pages.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (layout.pages[middle].top <= y) lower = middle;
    else upper = middle - 1;
  }
  return lower;
}

export function capturePdfAnchor(input: {
  layout: PdfLayout;
  scroll: PdfPoint;
  point: PdfPoint;
}): PdfAnchor {
  const page = pdfPageAtY(input.layout, input.scroll.y + input.point.y);
  const box = input.layout.pages[page];
  return {
    page,
    x: (input.scroll.x + input.point.x - box.left) / box.width,
    y: (input.scroll.y + input.point.y - box.top) / box.height,
  };
}

export function restorePdfAnchor(input: {
  layout: PdfLayout;
  anchor: PdfAnchor;
  point: PdfPoint;
  viewport: PdfSize;
}): PdfPoint {
  const box = input.layout.pages[input.anchor.page];
  return {
    x: Math.max(
      0,
      Math.min(
        input.layout.width - input.viewport.width,
        box.left + box.width * input.anchor.x - input.point.x,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        input.layout.height - input.viewport.height,
        box.top + box.height * input.anchor.y - input.point.y,
      ),
    ),
  };
}

export function visiblePdfPages(input: {
  layout: PdfLayout;
  scrollTop: number;
  viewportHeight: number;
}): number[] {
  const from = Math.max(0, input.scrollTop - input.viewportHeight);
  const to = input.scrollTop + input.viewportHeight * 2;
  const pages: number[] = [];
  for (let i = pdfPageAtY(input.layout, from); i < input.layout.pages.length; i += 1) {
    const box = input.layout.pages[i];
    if (box.top > to) break;
    if (box.top + box.height >= from) pages.push(i);
  }
  return pages;
}
