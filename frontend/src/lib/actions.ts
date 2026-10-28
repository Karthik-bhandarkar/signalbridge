"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidentTimeline, incidents } from "@/db/schema";
import { authenticate, endSession, getSession, startSession } from "@/lib/auth";
import { generateTraffic } from "@/lib/seed";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticate(email, password);
  if (!user) return { error: "Invalid credentials. Use the demo operator shown below." };
  await startSession(user);
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function incidentAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ref = String(formData.get("ref") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const [incident] = await db.select().from(incidents).where(eq(incidents.ref, ref)).limit(1);
  if (!incident) return;

  const now = new Date();
  const actor = session.email.split("@")[0];

  if (action === "acknowledge" && incident.status === "open") {
    await db
      .update(incidents)
      .set({ status: "acknowledged", acknowledgedAt: now, assignee: actor })
      .where(eq(incidents.id, incident.id));
    await db.insert(incidentTimeline).values({
      incidentId: incident.id,
      kind: "acknowledged",
      message: `acknowledged by ${actor}`,
      actor,
      createdAt: now,
    });
  }

  if (action === "resolve" && incident.status !== "resolved") {
    await db
      .update(incidents)
      .set({
        status: "resolved",
        resolvedAt: now,
        acknowledgedAt: incident.acknowledgedAt ?? now,
        assignee: incident.assignee ?? actor,
      })
      .where(eq(incidents.id, incident.id));
    await db.insert(incidentTimeline).values({
      incidentId: incident.id,
      kind: "resolved",
      message: note ? `resolved by ${actor} — ${note}` : `resolved by ${actor}`,
      actor,
      createdAt: now,
    });
  }

  if (action === "reopen" && incident.status === "resolved") {
    await db
      .update(incidents)
      .set({ status: "open", resolvedAt: null, lastSeenAt: now })
      .where(eq(incidents.id, incident.id));
    await db.insert(incidentTimeline).values({
      incidentId: incident.id,
      kind: "opened",
      message: `reopened by ${actor}`,
      actor,
      createdAt: now,
    });
  }

  if (action === "escalate") {
    const next = Math.min(3, incident.escalationLevel + 1);
    if (next !== incident.escalationLevel) {
      await db
        .update(incidents)
        .set({ escalationLevel: next, severity: next === 3 ? "critical" : incident.severity })
        .where(eq(incidents.id, incident.id));
      await db.insert(incidentTimeline).values({
        incidentId: incident.id,
        kind: "escalated",
        message: `manually escalated L${incident.escalationLevel} → L${next} by ${actor}`,
        actor,
        createdAt: now,
      });
    }
  }

  if (action === "note" && note) {
    await db.insert(incidentTimeline).values({
      incidentId: incident.id,
      kind: "note",
      message: note,
      actor,
      createdAt: now,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/incidents");
  revalidatePath(`/dashboard/incidents/${ref}`);
}

export async function bulkAcknowledgeAction() {
  const session = await getSession();
  if (!session) redirect("/login");
  const actor = session.email.split("@")[0];
  const open = await db
    .select({ id: incidents.id, ref: incidents.ref })
    .from(incidents)
    .where(and(eq(incidents.status, "open"), eq(incidents.severity, "critical")));
  const now = new Date();
  for (const incident of open) {
    await db
      .update(incidents)
      .set({ status: "acknowledged", acknowledgedAt: now, assignee: actor })
      .where(eq(incidents.id, incident.id));
    await db.insert(incidentTimeline).values({
      incidentId: incident.id,
      kind: "acknowledged",
      message: `bulk-acknowledged by ${actor}`,
      actor,
      createdAt: now,
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/incidents");
}

export async function simulateTrafficAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const count = Math.min(40, Math.max(1, Number(formData.get("count") ?? 8)));
  await generateTraffic(count, 0.25);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/incidents");
}
