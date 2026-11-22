import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

test("renders inline exponents and display fractions without interpreting code as math", async ({ page }) => {
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "markdown-math-",
    title: "Markdown math",
    initialPrompt: "Show equations",
    featureValues: { mockAssistantResponse: "Inline: $E = mc^2$\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n`$x$`" },
  });
  try {
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await openAgentRoute(page, agent);
    const message = page.getByTestId("assistant-message").last();
    await expect(message.locator("math")).toHaveCount(2);
    await expect(message.locator("math msup").first()).toBeAttached();
    await expect(message.locator("math mfrac")).toHaveText("13");
    await expect(message.locator("code")).toHaveText("$x$");
  } finally {
    await agent.cleanup();
  }
});
