import { expect, test as base } from "../support/fixtures";
import {
  appendSettledTimelineTurns,
  createSettledMockAgent,
  createSmallAssistantPng,
  emitSettledAssistantImage,
  expectAssistantImageRendered,
  openAssistantImageTimeline,
} from "../support/helpers/assistant-images";
import { lightboxViewportCenter, waitForLightboxScale } from "../support/helpers/lightbox";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";

const test = base.extend<{ imageWorkspace: SeededWorkspace }>({
  imageWorkspace: async ({ page: _page }, provide) => {
    const workspace = await seedWorkspace({ repoPrefix: "assistant-image-lightbox-" });
    try {
      await provide(workspace);
    } finally {
      await workspace.cleanup();
    }
  },
});

test("clicking an assistant image opens the zoomable lightbox", async ({
  imageWorkspace: workspace,
  page,
}) => {
  test.setTimeout(120_000);
  const image = await createSmallAssistantPng(workspace, {
    alt: "Assistant lightbox image",
    fileName: "assistant-lightbox.png",
  });
  const agent = await createSettledMockAgent(workspace, "Image lightbox");
  await emitSettledAssistantImage(workspace.client, agent, image);

  await openAssistantImageTimeline(page, agent);
  await expectAssistantImageRendered(page, image);

  await page.getByTestId("assistant-image-open").first().click();
  await expect(page.getByTestId("attachment-lightbox-close")).toBeVisible({ timeout: 10_000 });

  const center = await lightboxViewportCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -400);
  const zoomed = await waitForLightboxScale(page, (scale) => scale > 1.05);
  expect(zoomed).toBeGreaterThan(1.05);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("attachment-lightbox-close")).not.toBeVisible({ timeout: 5_000 });
});

test("the lightbox survives the timeline scrolling underneath it", async ({
  imageWorkspace: workspace,
  page,
}) => {
  test.setTimeout(180_000);
  const image = await createSmallAssistantPng(workspace, {
    alt: "Virtualized lightbox image",
    fileName: "virtualized-lightbox.png",
  });
  const agent = await createSettledMockAgent(workspace, "Virtualized lightbox");
  await emitSettledAssistantImage(workspace.client, agent, image);
  // Enough turns that the image row is a virtualization candidate once the view scrolls away.
  await appendSettledTimelineTurns(workspace.client, agent, 12);

  await openAssistantImageTimeline(page, agent);
  await page.getByRole("img", { name: image.alt }).first().waitFor({ timeout: 30_000 });
  await page.getByTestId("assistant-image-open").first().click();
  await expect(page.getByTestId("attachment-lightbox-close")).toBeVisible({ timeout: 10_000 });

  // Scrolled through the DOM, not the pointer: the modal covers the timeline, which is exactly
  // what it should do. A lightbox owned by the message row would unmount with it as the list
  // virtualizes; this one lives in the app shell.
  await page
    .getByTestId("agent-chat-scroll")
    .first()
    .evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("attachment-lightbox-close")).toBeVisible();
  await expect(page.getByTestId("attachment-lightbox-image")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("attachment-lightbox-close")).not.toBeVisible({ timeout: 5_000 });
});
