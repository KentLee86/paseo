import { describe, expect, it } from "vitest";
import {
  capturePdfAnchor,
  fitPdfPageZoom,
  layoutPdfPages,
  restorePdfAnchor,
  visiblePdfPages,
} from "./layout";

const sizes = [
  { width: 300, height: 300 },
  { width: 600, height: 900 },
];

describe("PDF continuous layout", () => {
  it("fits mixed page widths and places pages in a continuous column", () => {
    const layout = layoutPdfPages({ sizes, viewportWidth: 324, zoom: 1 });
    expect(layout).toEqual({
      width: 324,
      height: 786,
      pages: [
        { width: 300, height: 300, left: 12, top: 12, scale: 1 },
        { width: 300, height: 450, left: 12, top: 324, scale: 0.5 },
      ],
    });
  });

  it("fits a tall page completely inside the available viewport", () => {
    const zoom = fitPdfPageZoom({ page: sizes[1], viewport: { width: 324, height: 324 } });
    const layout = layoutPdfPages({ sizes, viewportWidth: 324, zoom });
    expect(zoom).toBeCloseTo(2 / 3);
    expect(layout.pages[1].height).toBeCloseTo(300);
  });

  it("keeps the same document point under the zoom focal point", () => {
    const before = layoutPdfPages({ sizes, viewportWidth: 324, zoom: 1 });
    const point = { x: 162, y: 100 };
    const anchor = capturePdfAnchor({ layout: before, scroll: { x: 0, y: 374 }, point });
    expect(anchor).toEqual({ page: 1, x: 0.5, y: 1 / 3 });
    const after = layoutPdfPages({ sizes, viewportWidth: 324, zoom: 2 });
    const scroll = restorePdfAnchor({
      layout: after,
      anchor,
      point,
      viewport: { width: 324, height: 324 },
    });
    expect(scroll).toEqual({ x: 150, y: 824 });
    expect(capturePdfAnchor({ layout: after, scroll, point })).toEqual(anchor);
  });

  it("clamps scroll at the document edges", () => {
    const layout = layoutPdfPages({ sizes, viewportWidth: 324, zoom: 1 });
    expect(
      restorePdfAnchor({
        layout,
        anchor: { page: 0, x: 0, y: 0 },
        point: { x: 162, y: 162 },
        viewport: { width: 324, height: 324 },
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("only selects nearby pages in a long document", () => {
    const layout = layoutPdfPages({
      sizes: Array.from({ length: 100 }, () => sizes[0]),
      viewportWidth: 324,
      zoom: 1,
    });
    expect(visiblePdfPages({ layout, scrollTop: 31_000, viewportHeight: 324 })).toEqual([98, 99]);
  });
});
