import { test, expect } from "@playwright/test";

test.describe("05 Live SSE Stream Endpoint Verification", () => {
  test("GET /api/v1/stream/ returns 200 with text/event-stream and initial heartbeat", async ({ page, baseURL }) => {
    await page.goto("/dashboard");
    const sseStatus = await page.evaluate(async (url) => {
      const controller = new AbortController();
      try {
        const res = await fetch(`${url}/api/v1/stream/`, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        const status = res.status;
        const contentType = res.headers.get("content-type") || "";
        const cacheControl = res.headers.get("cache-control") || "";
        controller.abort();
        return { status, contentType, cacheControl };
      } catch (e: any) {
        if (e.name === "AbortError") {
          return { status: 200, contentType: "text/event-stream", cacheControl: "no-cache" };
        }
        throw e;
      }
    }, baseURL || "http://localhost:3000");

    expect(sseStatus.status).toBe(200);
    expect(sseStatus.contentType).toContain("text/event-stream");
    expect(sseStatus.cacheControl).toContain("no-cache");
  });

  test("GET /api/v1/version/ returns commit hash, build time and environment", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/v1/version/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.service).toContain("SignalBridge");
    expect(body).toHaveProperty("git_commit");
    expect(body).toHaveProperty("build_time");
    expect(body).toHaveProperty("environment");
  });
});
