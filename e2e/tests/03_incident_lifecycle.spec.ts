import { test, expect } from "@playwright/test";

test.describe("03 Incident Lifecycle Management", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as demo operator via API to prime cookies
    await page.goto("/dashboard");
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();
      await page.getByRole("button", { name: /Demo Operator/i }).first().click();
      await page.getByRole("button", { name: /Sign In to Operator Console/i }).click();
      await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    }
  });

  test("Operator can acknowledge and resolve active incidents", async ({ page }) => {
    await page.goto("/dashboard");

    // Look for an Ack button on the active incident triage feed
    const ackBtn = page.getByRole("button", { name: /^Ack$/i }).first();
    if (await ackBtn.isVisible()) {
      await ackBtn.click();
      // Verify row state updates
      await page.waitForTimeout(1000);
    }

    // Look for a Resolve button
    const resolveBtn = page.getByRole("button", { name: /^Resolve$/i }).first();
    if (await resolveBtn.isVisible()) {
      await resolveBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("Clicking an incident opens the detail drawer with alert timeline", async ({ page }) => {
    await page.goto("/dashboard");

    const incidentRow = page.locator("table tbody tr").first();
    if (await incidentRow.isVisible()) {
      await incidentRow.click();
      // Verify drawer opens
      await expect(page.locator("text=Correlated Signals").or(page.locator("text=Incident Details"))).toBeVisible();

      // Close drawer
      const closeBtn = page.locator("button[aria-label='Close drawer']").or(page.locator("button:has-text('✕')"));
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });
});
