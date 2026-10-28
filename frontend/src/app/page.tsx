import type { Metadata } from "next";
import Nav from "@/components/marketing/Nav";
import Hero from "@/components/marketing/Hero";
import Statement from "@/components/marketing/Statement";
import FeatureHex from "@/components/marketing/FeatureHex";
import PipelineDemo from "@/components/marketing/PipelineDemo";
import Bento from "@/components/marketing/Bento";
import Lifecycle from "@/components/marketing/Lifecycle";
import UnderTheHood from "@/components/marketing/UnderTheHood";
import Showcase from "@/components/marketing/Showcase";
import Proof from "@/components/marketing/Proof";
import Quickstart from "@/components/marketing/Quickstart";
import FinalCTA from "@/components/marketing/FinalCTA";
import Footer from "@/components/marketing/Footer";
import { ScrollProgress, ToastHost } from "@/components/marketing/primitives";
import PremiumBackground from "@/components/marketing/PremiumBackground";
import SmoothScroll from "@/components/marketing/SmoothScroll";
import { getLandingMetrics } from "@/lib/metrics";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SignalBridge — Turn alert noise into one clear incident",
  description:
    "SignalBridge verifies signed webhooks, records duplicate deliveries, correlates related alerts into incidents, and gives operators a console to investigate and respond.",
  alternates: { canonical: "/" },
};

/**
 * Section order follows the visitor's natural questions, in order (design
 * doc 01 §8.1): what is it (Hero) → problem (Statement) → solution / what it
 * does (FeatureHex) → how it works (PipelineDemo) → features (Bento) →
 * reliability (Lifecycle) → security (UnderTheHood) → evidence (Proof) →
 * explore (Showcase, Quickstart) → links & contact (FinalCTA, Footer).
 */
export default async function LandingPage() {
  await ensureSeed();
  const metrics = await getLandingMetrics();

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <PremiumBackground />
      <div className="lp-grain" aria-hidden="true" />
      <SmoothScroll />
      <ScrollProgress />
      <ToastHost />
      <Nav />

      <main id="main" className="lp-main">
        <Hero avgLatencyMs={metrics.avgLatencyMs} />
        <Statement />
        <FeatureHex />
        <PipelineDemo />
        <Bento />
        <Lifecycle />
        <UnderTheHood />
        <Showcase metrics={metrics} />
        <Proof metrics={metrics} />
        <Quickstart />
        <FinalCTA />
      </main>

      <Footer />
    </div>
  );
}
