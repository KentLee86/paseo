import { expect, type Page } from "@playwright/test";

/** The zoom transform react-zoom-pan-pinch applies, read back from the composited element. */
export interface LightboxTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export async function readLightboxTransform(page: Page): Promise<LightboxTransform> {
  const matrix = await page.getByTestId("attachment-lightbox-image").evaluate((element) => {
    const content = element.parentElement;
    if (!content) {
      throw new Error("lightbox image has no transform parent");
    }
    return getComputedStyle(content).transform;
  });
  if (matrix === "none") {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const values = matrix
    .replace(/^matrix\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((part) => Number(part.trim()));
  if (values.length !== 6 || values.some(Number.isNaN)) {
    throw new Error(`unexpected transform: ${matrix}`);
  }
  return { scale: values[0]!, translateX: values[4]!, translateY: values[5]! };
}

export async function lightboxViewportCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("attachment-lightbox-viewport").boundingBox();
  if (!box) {
    throw new Error("lightbox viewport is not laid out");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Zoom settles through an animation frame loop, so callers poll rather than reading once.
 * Returns the scale that satisfied the predicate.
 */
export async function waitForLightboxScale(
  page: Page,
  predicate: (scale: number) => boolean,
): Promise<number> {
  let last = 0;
  await expect
    .poll(
      async () => {
        last = (await readLightboxTransform(page)).scale;
        return predicate(last);
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  return last;
}
