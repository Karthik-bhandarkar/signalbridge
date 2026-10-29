import { test, expect } from "@playwright/test";

test.describe("02 Operator Authentication & Session Hydration", () => {
  test("1-Click Demo Operator authentication and persistent session hydration", async ({ page }) => {
    await page.goto("/dashboard");

    // Open login modal
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();
    await expect(page.locator("text=Operator Authentication")).toBeVisible();

    // Click 1-Click Demo Operator fill and sign in
    const demoOpBtn = page.getByRole("button", { name: /1-Click Sign In as Demo Operator/i });
    await demoOpBtn.click();

    // Modal closes and Operator badge displays
    await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    await expect(page.locator("text=demo.operator").first()).toBeVisible();

    // Reload page to verify client-side hydration via /api/v1/auth/me/
    await page.reload();
    await expect(page.locator("text=demo.operator").first()).toBeVisible();

    // Sign out
    const signOutBtn = page.getByRole("button", { name: /Sign out/i }).first();
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
      await expect(page.getByRole("button", { name: /Sign In as Operator/i }).first()).toBeVisible();
    }
  });

  test("Invalid credentials show error without unhandled exception", async ({ page }) => {
    await page.goto("/dashboard");
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();

    await page.locator("input[placeholder*='demo.operator']").fill("invalid_user");
    await page.locator("input[type='password']").fill("WrongPassword999!");
    await page.getByRole("button", { name: /Authenticate Operator Session/i }).click();

    await expect(page.locator("text=Invalid credentials").or(page.locator("text=failed"))).toBeVisible();
  });
});
