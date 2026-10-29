import { test, expect } from "@playwright/test";

test.describe("06 RBAC & Permissions Enforcement", () => {
  test("Viewer role cannot dispatch simulator or trigger operator mutations", async ({ page }) => {
    await page.goto("/dashboard");

    // Authenticate as Demo Viewer
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();
    await page.getByRole("button", { name: /Demo Viewer/i }).first().click();
    await page.getByRole("button", { name: /Sign In to Operator Console/i }).click();

    await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    await expect(page.locator("text=demo.viewer").first()).toBeVisible();

    // Verify simulator dispatch button is disabled for viewer
    const disabledBtn = page.getByRole("button", { name: /Sign in as demo operator to run the simulator/i });
    await expect(disabledBtn).toBeDisabled();
  });
});
