import Link from "next/link";
import { ArrowLeft, CircleDot } from "lucide-react";
import { redirect } from "next/navigation";
import Brand from "@/components/ui/Brand";
import LoginForm from "@/components/ops/LoginForm";
import { getSession } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await ensureSeed();
  if (await getSession()) redirect("/dashboard");
  return <main className="ops-login">
    <section className="ops-login-story"><Link href="/" aria-label="SignalBridge home"><Brand /></Link><div className="ops-login-story-copy"><h2>Every signal.<br />A clearer next step.</h2><p>Your services, incidents, and response history. One focused workspace for the work that matters when everything is firing.</p></div><span className="ops-login-story-bottom">From the first signal to the final resolution.</span></section>
    <section className="ops-login-form"><div className="ops-login-form-inner"><Link href="/" className="ops-login-back"><ArrowLeft size={11} />Back to product</Link><h1>Welcome to your workspace.</h1><p>A clear view of your signals starts here.<br />Sign in to the SignalBridge operations console.</p><LoginForm /><div className="ops-login-demo"><strong><CircleDot size={10} />DEMO OPERATOR · READY TO EXPLORE</strong><p>ops@signalbridge.dev · passphrase: oncall</p></div></div></section>
  </main>;
}
