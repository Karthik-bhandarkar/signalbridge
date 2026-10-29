/**
 * Public Authentication Accounts for SignalBridge
 * Admin and Demo roles for rapid evaluation and platform operations.
 */
export const PUBLIC_DEMO_ACCOUNTS = {
  admin: {
    label: "Admin",
    username: "Admin",
    password: "Admin@123",
    role: "ADMIN",
    description: "Full administrator access: Incident Triage, System Controls, Simulator Studio.",
  },
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
