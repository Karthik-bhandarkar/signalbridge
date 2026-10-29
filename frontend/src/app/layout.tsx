import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/montserrat";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "SignalBridge — Turn alert noise into one clear incident",
    template: "%s · SignalBridge",
  },
  description:
    "SignalBridge verifies signed webhooks, records duplicate deliveries, correlates related alerts into incidents, and gives operators a clear console to investigate and respond.",
  applicationName: "SignalBridge",
  authors: [{ name: "Karthik Bhandarkar" }],
  keywords: ["incident response", "webhook ingestion", "alert correlation", "SRE", "on-call", "deduplication"],
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: {
    type: "website",
    title: "SignalBridge — Turn alert noise into one clear incident",
    description:
      "Signed webhook ingestion, duplicate detection, incident correlation and an operator console backed by PostgreSQL.",
    siteName: "SignalBridge",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "SignalBridge — Turn alert noise into one clear incident",
    description: "Turn alert noise into one clear incident, and never lose a signal.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#35275f] text-[#f6f1ff] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
