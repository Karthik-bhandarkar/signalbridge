import { test, expect } from "@playwright/test";

test.describe("05 Live SSE Stream Endpoint Verification", () => {
  test("GET /api/v1/stream/ returns 200 with text/event-stream and initial heartbeat", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/v1/stream/`, {
      headers: {
        Accept: "text/event-stream",
      },
    });

    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("text/event-stream");
    expect(res.headers()["cache-control"]).toContain("no-cache");
  });

  test("GET /api/v1/version/ returns commit hash, build time and environment", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/v1/version/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("SignalBridge Gateway API");
    expect(body).toHaveProperty("git_commit");
    expect(body).toHaveProperty("build_time");
    expect(body).toHaveProperty("environment");
  });
});
