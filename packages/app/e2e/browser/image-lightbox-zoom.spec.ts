import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import type { WithWorkspace } from "../support/helpers/with-workspace";
import { clickNewChat } from "../support/helpers/launcher";
import {
  attachImageFromMenu,
  closeImageLightbox,
  expectAttachmentPill,
  expectComposerVisible,
  openImageLightbox,
} from "../support/helpers/composer";
import {
  lightboxViewportCenter,
  readLightboxTransform,
  waitForLightboxScale,
} from "../support/helpers/lightbox";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const TEST_IMAGE = { name: "zoom.png", mimeType: "image/png", buffer: MINIMAL_PNG };

async function openLightboxWithImage(
  page: Page,
  withWorkspace: WithWorkspace,
  prefix: string,
): Promise<void> {
  const workspace = await withWorkspace({ prefix });
  await workspace.navigateTo();
  await clickNewChat(page);
  await expectComposerVisible(page);
  await attachImageFromMenu(page, TEST_IMAGE);
  await expectAttachmentPill(page, "composer-image-attachment-pill");
  await openImageLightbox(page);
  // The zoom wrapper only binds wheel/dblclick once it has measured itself; acting before that
  // silently drops the gesture.
  await expect(page.getByTestId("attachment-lightbox-image")).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(async () => (await page.getByTestId("attachment-lightbox-viewport").boundingBox())?.width)
    .toBeGreaterThan(0);
}

test.describe("image lightbox zoom", () => {
  test("opens at fit and fills the viewport instead of a fixed box", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(60_000);
    await openLightboxWithImage(page, withWorkspace, "zoom-fit-");

    const transform = await readLightboxTransform(page);
    expect(transform.scale).toBeCloseTo(1, 2);

    // The 960x640 cap is gone: the viewport tracks the modal, so a wide window gets a wide image.
    const viewport = await page.getByTestId("attachment-lightbox-viewport").boundingBox();
    const windowSize = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport!.height).toBeGreaterThan(0);
    expect(viewport!.width).toBeGreaterThan((windowSize?.width ?? 0) * 0.5);

    await closeImageLightbox(page);
  });

  test("mouse wheel zooms in and keyboard 0 resets", async ({ page, withWorkspace }) => {
    test.setTimeout(60_000);
    await openLightboxWithImage(page, withWorkspace, "zoom-wheel-");

    const center = await lightboxViewportCenter(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -400);

    const zoomed = await waitForLightboxScale(page, (scale) => scale > 1.05);
    expect(zoomed).toBeGreaterThan(1.05);
    // One notch is one step. The library's `smooth` mode multiplies by the raw wheel delta, which
    // slams straight to max zoom; this pins the notch-sized behaviour.
    expect(zoomed).toBeLessThan(3);

    await page.keyboard.press("0");
    await waitForLightboxScale(page, (scale) => scale <= 1.001);

    await closeImageLightbox(page);
  });

  test("double click toggles zoom and dragging pans the zoomed image", async ({
    page,
    withWorkspace,
  }) => {
    test.setTimeout(60_000);
    await openLightboxWithImage(page, withWorkspace, "zoom-drag-");

    const center = await lightboxViewportCenter(page);
    await page.mouse.dblclick(center.x, center.y);
    await waitForLightboxScale(page, (scale) => scale > 1.05);

    const before = await readLightboxTransform(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x - 120, center.y, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => (await readLightboxTransform(page)).translateX, { timeout: 5_000 })
      .not.toBe(before.translateX);

    // A pan that overshoots the picture must not be read as a backdrop click.
    await expect(page.getByTestId("attachment-lightbox-close")).toBeVisible();

    await closeImageLightbox(page);
  });

  test("keyboard plus and minus zoom", async ({ page, withWorkspace }) => {
    test.setTimeout(60_000);
    await openLightboxWithImage(page, withWorkspace, "zoom-keys-");

    await page.keyboard.press("+");
    const zoomedIn = await waitForLightboxScale(page, (scale) => scale > 1.05);
    expect(zoomedIn).toBeGreaterThan(1.05);

    await page.keyboard.press("-");
    await waitForLightboxScale(page, (scale) => scale < zoomedIn);

    await closeImageLightbox(page);
  });
});
