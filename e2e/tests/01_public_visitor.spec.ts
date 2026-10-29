import { test, expect } from "@playwright/test";

test.describe("01 Public Visitor Experience", () => {
  test("Landing page loads with brand, health status, and live telemetry", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SignalBridge/);

    // Verify Brand Logo
    const logo = page.locator("header").getByText(/signalbridge/i).first();
    await expect(logo).toBeVisible();

    // Verify Dashboard CTA Button
    const dashboardCta = page.getByRole("link", { name: /Open Dashboard/i }).first();
    await expect(dashboardCta).toBeVisible();
  });

  test("Navigation across public dashboard routes returns 200 and renders cleanly", async ({ page }) => {
    // 1. Overview
    const resOverview = await page.goto("/dashboard");
    expect(resOverview?.status()).toBe(200);
    await expect(page.locator("text=Mission Control").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign In as Operator/i }).first()).toBeVisible();

    // 2. Incidents Board
    const resIncidents = await page.goto("/dashboard/incidents");
    expect(resIncidents?.status()).toBe(200);
    await expect(page.locator("text=Incident Operations Board")).toBeVisible();

    // 3. Alerts Ingestion Log
    const resEvents = await page.goto("/dashboard/events");
    expect(resEvents?.status()).toBe(200);
    await expect(page.locator("text=Alerts (Ingestion Log)").first()).toBeVisible();

    // 4. System Health
    const resSystem = await page.goto("/dashboard/system");
    expect(resSystem?.status()).toBe(200);
    await expect(page.locator("text=System Health").first()).toBeVisible();

    // 5. API Documentation
    const resDocs = await page.goto("/docs");
    expect(resDocs?.status()).toBe(200);
    await expect(page.locator("text=Your first signal.")).toBeVisible();
  });

  test("Unauthenticated actions prompt the operator login modal", async ({ page }) => {
    await page.goto("/dashboard");

    // Click topbar Sign In
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();

    // Verify Operator Modal appears
    await expect(page.locator("text=Operator Authentication")).toBeVisible();
    await expect(page.getByRole("button", { name: /Demo Operator/i }).first()).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
  });
});

