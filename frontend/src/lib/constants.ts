/**
 * Public Demo Accounts for SignalBridge
 * Safe for public consumption — these accounts have non-privileged operator/viewer access only.
 * Real administrative credentials must never be committed to source control.
 */
export const PUBLIC_DEMO_ACCOUNTS = {
  operator: {
    label: "Demo Operator",
    username: "demo.operator",
    password: "DemoOperator2026!#Secure",
    role: "OPERATOR",
    description: "Triage incidents (Acknowledge, Resolve), run live simulator, view logs.",
  },
  viewer: {
    label: "Demo Viewer",
    username: "demo.viewer",
    password: "DemoViewer2026!#Secure",
    role: "VIEWER",
    description: "Read-only operational observer access.",
  },
};
