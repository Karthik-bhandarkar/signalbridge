import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { operators } from "@/db/schema";

const COOKIE = "sb_session";
const MAX_AGE = 60 * 60 * 12;

function secret() {
  return process.env.SESSION_SECRET ?? "signalbridge-dev-session-secret";
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const candidate = scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(digest);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SessionUser = { email: string; name: string; role: string };

function seal(user: SessionUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE * 1000 })).toString(
    "base64url",
  );
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unseal(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionUser & {
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return { email: parsed.email, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return unseal(store.get(COOKIE)?.value);
}

export async function startSession(user: SessionUser) {
  const store = await cookies();
  store.set(COOKIE, seal(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export const DEMO_CREDENTIALS = {
  email: "ops@signalbridge.dev",
  password: "oncall",
};

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const normEmail = email.toLowerCase().trim();
  if (normEmail === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
    return { email: normEmail, name: "Demo Operator", role: "admin" };
  }
  try {
    const [operator] = await db
      .select()
      .from(operators)
      .where(eq(operators.email, normEmail))
      .limit(1);
    if (!operator) return null;
    if (!verifyPassword(password, operator.passwordHash)) return null;
    return { email: operator.email, name: operator.name, role: operator.role };
  } catch (err) {
    console.warn("[Auth] DB lookup error:", err);
    return null;
  }
}
