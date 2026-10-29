/**
 * SignalBridge Client-Side Auth Types & Utilities
 * Single Source of Truth: Django SessionAuthentication via /api/v1/auth/*
 */
import { PUBLIC_DEMO_ACCOUNTS } from "./constants";

export interface User {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  role: "VIEWER" | "OPERATOR" | "ADMIN" | string;
  is_demo_user?: boolean;
}

export interface AuthState {
  user: User | null;
  authenticated: boolean;
  loading: boolean;
  csrfToken?: string;
}

export { PUBLIC_DEMO_ACCOUNTS };
