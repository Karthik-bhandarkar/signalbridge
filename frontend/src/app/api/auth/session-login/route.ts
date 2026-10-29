import { NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    let identifier = "";
    let password = "";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      identifier = String(body.username ?? body.email ?? "").trim();
      password = String(body.password ?? "");
    } else {
      const formData = await request.formData();
      identifier = String(formData.get("username") ?? formData.get("email") ?? "").trim();
      password = String(formData.get("password") ?? "");
    }

    const user = await authenticate(identifier, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    await startSession(user);
    return NextResponse.json({ status: "success", user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

