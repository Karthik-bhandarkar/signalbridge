import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

test.describe("Demo Flow Capture & Screen Artifact Generator", () => {
  const screenshotsDir = path.resolve(__dirname, "../../docs/demo-screenshots");

  test.beforeAll(async () => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test("Capture full 11-step end-to-end demo flow", async ({ page }) => {
    // Step 1: Landing Page Hero & Telemetry
    await page.goto("/");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page).toHaveTitle(/SignalBridge/);
    await page.screenshot({ path: path.join(screenshotsDir, "01-landing-page.png"), fullPage: false });

    // Step 2: Overview Page in Public Observer Mode
    await page.goto("/dashboard");
    await expect(page.locator("text=Mission Control").first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "02-dashboard-observer.png"), fullPage: false });

    // Step 3: Open Operator Login Modal
    const signInBtn = page.getByRole("button", { name: /Sign In as Operator/i }).first();
    await signInBtn.click();
    await expect(page.locator("text=Operator Authentication")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "03-operator-login-modal.png"), fullPage: false });

    // Step 4: 1-Click Demo Operator Authentication
    await page.getByRole("button", { name: /Demo Operator/i }).first().click();
    await page.getByRole("button", { name: /Sign In to Operator Console/i }).click();
    await expect(page.locator("text=Operator Authentication")).not.toBeVisible();
    await expect(page.locator("text=demo.operator").first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "04-dashboard-operator.png"), fullPage: false });

    // Step 5: Simulator Dispatch
    const scenarioRadio = page.locator("input[type='radio']").first();
    await scenarioRadio.check();
    const dispatchBtn = page.getByRole("button", { name: /Dispatch Live Webhook/i });
    if (await dispatchBtn.isEnabled()) {
      await dispatchBtn.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(screenshotsDir, "05-simulator-dispatched.png"), fullPage: false });

    // Step 6: Incident Detail Drawer Deep-Dive
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, "06-incident-drawer.png"), fullPage: false });

      // Step 7: Acknowledge Incident
      const ackDrawerBtn = page.getByRole("button", { name: /Acknowledge Incident/i });
      if (await ackDrawerBtn.isVisible()) {
        await ackDrawerBtn.click();
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: path.join(screenshotsDir, "07-incident-acknowledged.png"), fullPage: false });

      // Close drawer
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // Step 8: Incident Operations Board (Kanban)
    await page.goto("/dashboard/incidents");
    await expect(page.locator("text=Incident Operations Board")).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "08-incidents-board.png"), fullPage: false });

    // Step 9: Alerts Ingestion Log
    await page.goto("/dashboard/events");
    await expect(page.locator("text=Alerts (Ingestion Log)").first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "09-alerts-deduplication.png"), fullPage: false });

    // Step 10: System Health Diagnostics
    await page.goto("/dashboard/system");
    await expect(page.locator("text=System Health").first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, "10-system-health.png"), fullPage: false });
  });
});
