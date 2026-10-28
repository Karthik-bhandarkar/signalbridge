import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Run against a started production preview. This test does not mutate incidents.
const base = (process.env.CHECK_URL || "http://localhost:3000").replace(/\/$/, "");
const output = ".screenshots/animated-hero";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const report = { base, testedAt: new Date().toISOString(), layouts: [], phases: [], checks: [] };

try {
  for (const width of [375, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(850);
    const layout = await page.evaluate(() => {
      const figure = document.querySelector("[data-workflow-visual]");
      const hero = document.querySelector("[data-hero]");
      const panel = figure.firstElementChild;
      const box = element => {
        const r = element.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      return {
        width: innerWidth,
        overflow: document.documentElement.scrollWidth - innerWidth,
        workflowCount: document.querySelectorAll("[data-workflow-visual]").length,
        workflowInHero: hero.contains(figure),
        oldVCount: document.querySelectorAll(".hx-art, .hx-tri, .hx-tri-ghost").length,
        headline: document.querySelector("h1").innerText.replaceAll("\n", " / "),
        panel: box(panel),
        copy: box(document.querySelector("h1")),
        actions: box(hero.querySelector("a[href='/dashboard']").parentElement),
        attributes: box(hero.lastElementChild.lastElementChild),
        labels: [...panel.firstElementChild.children].map(el => el.textContent),
        incomingPaths: document.querySelectorAll("[data-incoming-path]").length,
        outgoingPaths: document.querySelectorAll("[data-outgoing-path]").length,
        panelBackground: getComputedStyle(panel).backgroundColor,
      };
    });
    assert.equal(layout.overflow, 0);
    assert.equal(layout.workflowCount, 1);
    assert.equal(layout.workflowInHero, true);
    assert.equal(layout.oldVCount, 0);
    assert.equal(layout.headline, "TURN ALERT / NOISE INTO / ONE CLEAR / INCIDENT.");
    assert.equal(layout.incomingPaths, 4);
    assert.equal(layout.outgoingPaths, 1);
    assert.deepEqual(layout.labels, ["Incoming signals", "Verify + Deduplicate + Correlate", "One incident"]);
    if (width === 1440) {
      assert.ok(layout.panel.right < layout.copy.x, "Workflow and text must be adjacent, not overlapping.");
      assert.ok(layout.panel.bottom < 900 && layout.attributes.bottom < 900 && layout.actions.bottom < 900, "Desktop hero must fit the first viewport.");
    } else {
      assert.ok(layout.panel.y > layout.actions.bottom, "Stacked layout must place the diagram after the actions.");
      assert.ok(layout.attributes.y > layout.panel.bottom, "Attributes must follow the workflow on stacked screens.");
    }
    report.layouts.push(layout);
    console.log("PASS responsive layout", width, "panel", Math.round(layout.panel.width), "x", Math.round(layout.panel.height));
    await page.screenshot({ path: `${output}/${width}-hero.png` });
    await page.locator("[data-workflow-visual]").screenshot({ path: `${output}/${width}-workflow.png` });

    // Confirm path endpoints stay attached to the node/card after responsive reflow.
    const connections = await page.evaluate(() => {
      const path = document.querySelector("[data-outgoing-path]");
      const svg = path.ownerSVGElement;
      const ctm = path.getScreenCTM();
      const start = path.getPointAtLength(0).matrixTransform(ctm);
      const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(ctm);
      const node = document.querySelector("[data-processing-response]").parentElement.getBoundingClientRect();
      const card = document.querySelector("[data-incident-response]").closest("article").getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const vertical = svgRect.width < 540;
      const expectedStart = vertical ? { x: node.left + node.width / 2, y: node.bottom + 2 } : { x: node.right + 2, y: node.top + node.height / 2 };
      const expectedEnd = vertical ? { x: card.left + card.width / 2, y: card.top - 2 } : { x: card.left - 2, y: card.top + card.height / 2 };
      return { startError: Math.hypot(start.x - expectedStart.x, start.y - expectedStart.y), endError: Math.hypot(end.x - expectedEnd.x, end.y - expectedEnd.y), vertical };
    });
    assert.ok(connections.startError < 2 && connections.endError < 2, `Detached output connector: ${JSON.stringify(connections)}`);
    console.log("PASS measured connector", width, connections);

    if (await page.locator(".lp-burger").isVisible()) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.locator(".lp-burger").click();
      await page.locator(".lp-sheet").waitFor();
      for (const label of ["Product", "How It Works", "Reliability", "Security", "Docs"]) {
        assert.equal(await page.locator(".lp-sheet").getByRole("link", { name: label, exact: true }).count(), 1);
      }
      await page.locator(".lp-burger").click();
    }
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Follow the single shared timeline for more than a complete nine-second loop.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: "networkidle" });
  const markerSamples = [];
  const phaseSequence = [];
  const responsePeaks = { processor: 0, incident: 0, confirmation: 0 };
  for (let i = 0; i < 42; i++) {
    const sample = await page.evaluate(() => {
      const figure = document.querySelector("[data-workflow-visual]");
      const points = [...document.querySelectorAll("[data-signal-marker]")].filter(el => Number(getComputedStyle(el).opacity) > 0.5).map(marker => {
        const path = marker.dataset.signalMarker === "outgoing" ? document.querySelector("[data-outgoing-path]") : marker.parentElement.querySelector("path");
        const a = marker.getScreenCTM();
        const position = new DOMPoint(0, 0).matrixTransform(a);
        const m = path.getScreenCTM();
        const length = path.getTotalLength();
        let distance = Infinity;
        for (let k = 0; k <= 120; k++) {
          const point = path.getPointAtLength(length * k / 120).matrixTransform(m);
          distance = Math.min(distance, Math.hypot(point.x - position.x, point.y - position.y));
        }
        return { type: marker.dataset.signalMarker, x: position.x, y: position.y, distance };
      });
      return {
        phase: figure.dataset.workflowPhase,
        points,
        processor: Number(getComputedStyle(document.querySelector("[data-processing-response]")).opacity),
        incident: Number(getComputedStyle(document.querySelector("[data-incident-response]")).opacity),
        confirmation: Number(getComputedStyle(document.querySelector("[data-confirmation-response]")).opacity),
      };
    });
    if (phaseSequence.at(-1) !== sample.phase) phaseSequence.push(sample.phase);
    for (const key of Object.keys(responsePeaks)) responsePeaks[key] = Math.max(responsePeaks[key], sample[key]);
    markerSamples.push(...sample.points);
    await page.waitForTimeout(250);
  }
  report.phases = phaseSequence;
  for (const phase of ["signals-arrive", "signals-travel", "processing", "incident-connection", "incident-response", "confirmation", "completed"]) assert.ok(phaseSequence.includes(phase), `Unobserved animation phase: ${phase}`);
  assert.ok(phaseSequence.filter(phase => phase === "signals-arrive").length >= 2, "The sequence did not repeat.");
  assert.ok(markerSamples.some(sample => sample.type === "incoming") && markerSamples.some(sample => sample.type === "outgoing"));
  assert.ok(markerSamples.every(sample => sample.distance < 4), "A signal indicator left its SVG curve.");
  assert.ok(responsePeaks.processor > 0.4 && responsePeaks.incident > 0.4 && responsePeaks.confirmation > 0.4);
  console.log("PASS full cycle and repeat", phaseSequence);
  console.log("PASS particle geometry:", markerSamples.length, "samples; max distance", Math.max(...markerSamples.map(sample => sample.distance)).toFixed(2), "px");
  console.log("PASS coordinated response peaks", responsePeaks);
  report.checks.push({ animation: "PASS", phaseSequence, markerSamples: markerSamples.length, responsePeaks });

  // Explicit pause and off-screen pause freeze the same clock, not separate loops.
  await page.getByRole("button", { name: "Pause workflow animation" }).click();
  const before = await page.locator("[data-processing-response]").getAttribute("style");
  await page.waitForTimeout(650);
  const after = await page.locator("[data-processing-response]").getAttribute("style");
  assert.equal(before, after);
  assert.equal(await page.locator("[data-workflow-visual]").getAttribute("data-animation-playing"), "false");
  await page.getByRole("button", { name: "Resume workflow animation" }).click();
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-workflow-visual]").getAttribute("data-animation-playing"), "false");
  console.log("PASS manual and off-screen pause");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.locator(".lp-cmdk-trigger").focus();
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-hero] a[href='#pipeline']").click();
  await page.waitForTimeout(700);
  const anchorTop = await page.locator("#pipeline").evaluate(el => el.getBoundingClientRect().top);
  assert.ok(anchorTop >= 58, "Sticky header obscures the See It Work target.");
  console.log("PASS keyboard palette and See It Work anchor");
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard");
  assert.equal(await page.locator("h1").innerText(), "Operational overview");
  for (const route of ["/dashboard/events", "/dashboard/incidents", "/dashboard/system", "/docs"]) {
    const response = await page.goto(base + route, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
  }
  assert.equal((await (await page.request.get(base + "/api/health")).json()).ok, true);
  console.log("PASS login, dashboard routes, docs, and health");
  await page.close();

  const reduced = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await reduced.goto(base, { waitUntil: "networkidle" });
  await reduced.waitForTimeout(150);
  assert.equal(await reduced.locator("[data-workflow-visual]").getAttribute("data-workflow-phase"), "static");
  assert.equal(await reduced.locator("[data-signal-marker]").count(), 0);
  assert.equal(await reduced.locator("[data-incoming-path]").count(), 4);
  assert.equal(await reduced.getByRole("button", { name: "Pause workflow animation" }).isDisabled(), true);
  await reduced.locator("[data-workflow-visual]").screenshot({ path: `${output}/375-reduced-motion.png` });
  await reduced.close();
  console.log("PASS fully visible reduced-motion fallback");
  report.checks.push({ pause: "PASS", navigation: "PASS", responsive: "PASS", reducedMotion: "PASS", existingRoutes: "PASS" });
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
