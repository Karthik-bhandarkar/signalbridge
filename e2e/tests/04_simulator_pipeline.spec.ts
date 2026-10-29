import { test, expect } from "@playwright/test";

test.describe("04 Live Webhook Simulator Pipeline", () => {
  test("Operator can dispatch live synthetic webhooks through the ingestion pipeline", async ({ page }) => {
    await page.goto("/dashboard");

    // Authenticate
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await page.getByRole("button", { name: /1-Click Sign In as Demo Operator/i }).click();
      await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    }

    // Verify simulator card exists
    await expect(page.locator("text=LIVE INGESTION SIMULATOR").or(page.locator("text=SIMULATOR"))).toBeVisible();

    // Select scenario
    const scenarioRadio = page.locator("input[type='radio']").first();
    await scenarioRadio.check();

    // Click Dispatch Live Webhook
    const dispatchBtn = page.getByRole("button", { name: /Dispatch Live Webhook/i });
    await expect(dispatchBtn).toBeEnabled();
    await dispatchBtn.click();

    // Wait for response payload
    await expect(page.locator("text=SIMULATION DISPATCHED").or(page.locator("text=Payload Ingested"))).toBeVisible({
      timeout: 10000,
    });
  });
});
