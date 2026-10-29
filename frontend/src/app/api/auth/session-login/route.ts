import { NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const identifier = String(formData.get("username") ?? formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

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

