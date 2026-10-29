import { test, expect } from "@playwright/test";

test.describe("06 RBAC & Permissions Enforcement", () => {
  test("Viewer role cannot dispatch simulator or trigger operator mutations", async ({ page }) => {
    await page.goto("/dashboard");

    // Authenticate as Demo Viewer
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();
    await page.getByRole("button", { name: /1-Click Sign In as Demo Viewer/i }).click();

    await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    await expect(page.locator("text=demo.viewer").first()).toBeVisible();

    // Verify simulator prompts for operator auth instead of enabling dispatch
    const promptBtn = page.getByRole("button", { name: /Sign in as demo operator to run the simulator/i });
    await expect(promptBtn).toBeVisible();

    // Verify dispatch button is NOT visible for viewer
    const dispatchBtn = page.getByRole("button", { name: /Dispatch Live Webhook/i });
    await expect(dispatchBtn).not.toBeVisible();
  });
});
