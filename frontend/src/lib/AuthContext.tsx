"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient, subscribeToAuthChanges } from "./api";
import type { User } from "./auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isOperator: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  login: (username: string, passkey: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "sb_active_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Instant hydration from localStorage if present (eliminates unauthenticated flicker)
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {
        // Ignore JSON error
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const saveUser = useCallback((u: User | null) => {
    setUser(u);
    if (typeof window !== "undefined") {
      try {
        if (u) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Ignore storage error
      }
    }
  }, []);

  const refreshAuth = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiClient.auth.me();
      if (res && res.authenticated && res.user) {
        saveUser(res.user);
        return res.user;
      } else {
        saveUser(null);
        return null;
      }
    } catch {
      saveUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [saveUser]);

  useEffect(() => {
    let active = true;

    // Asynchronously reconcile background session with server
    apiClient.auth
      .me()
      .then((res) => {
        if (active) {
          if (res && res.authenticated && res.user) {
            saveUser(res.user);
          } else {
            saveUser(null);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          saveUser(null);
          setLoading(false);
        }
      });

    // Listen to local and cross-tab auth state events
    const unsubscribe = subscribeToAuthChanges((type, payload) => {
      if (type === "LOGIN" && payload) {
        saveUser(payload as User);
        setAuthModalOpen(false);
      } else if (type === "LOGOUT") {
        saveUser(null);
      }
    });

    const handleTriggerModal = () => {
      setAuthModalOpen(true);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("sb_trigger_login_modal", handleTriggerModal);
    }

    return () => {
      active = false;
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("sb_trigger_login_modal", handleTriggerModal);
      }
    };
  }, [saveUser]);

  const login = async (username: string, passkey: string): Promise<User> => {
    const res = await apiClient.auth.login(username, passkey);
    saveUser(res.user);
    setAuthModalOpen(false);
    router.refresh();
    return res.user;
  };

  const logout = async (): Promise<void> => {
    await apiClient.auth.logout();
    saveUser(null);
    setAuthModalOpen(false);
    router.refresh();
  };

  const openLoginModal = () => setAuthModalOpen(true);
  const closeLoginModal = () => setAuthModalOpen(false);

  const isAuthenticated = Boolean(user);
  const isOperator = Boolean(
    user && (user.role === "OPERATOR" || user.role === "ADMIN" || user.is_staff || user.is_superuser)
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        isOperator,
        authModalOpen,
        setAuthModalOpen,
        openLoginModal,
        closeLoginModal,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
