export const GITHUB_URL = "https://github.com/Karthik-bhandarkar/signalbridge";
export const DASHBOARD_HREF = "/dashboard";
export const DOCS_HREF = "/docs";
export const HEALTH_HREF = "/api/health";

/** Header nav — preserved 1:1 from the approved reference: Product, How It Works, Reliability, Security, Docs. */
export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/#pipeline" },
  { label: "Reliability", href: "/#reliability" },
  { label: "Security", href: "/#security" },
  { label: "Docs", href: DOCS_HREF },
] as const;

/** ⌘K palette destinations. */
export const sectionLinks = [
  { id: "product", label: "What it does" },
  { id: "pipeline", label: "How it works" },
  { id: "features", label: "Feature overview" },
  { id: "reliability", label: "Incident lifecycle" },
  { id: "security", label: "Under the hood" },
  { id: "showcase", label: "Product tour" },
  { id: "proof", label: "Live numbers" },
  { id: "quickstart", label: "Quickstart" },
] as const;

export const githubUrl = GITHUB_URL;
