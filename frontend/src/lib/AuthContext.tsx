"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiClient, subscribeToAuthChanges, triggerLoginModal } from "./api";
import type { User } from "./auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isOperator: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  openLoginModal: () => void;
  login: (username: string, passkey: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const refreshAuth = useCallback(async (): Promise<User | null> => {
    try {
      const res = await apiClient.auth.me();
      if (res && res.authenticated && res.user) {
        setUser(res.user);
        return res.user;
      } else {
        setUser(null);
        return null;
      }
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiClient.auth
      .me()
      .then((res) => {
        if (mounted) {
          if (res && res.authenticated && res.user) {
            setUser(res.user);
          } else {
            setUser(null);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      });

    // Listen to cross-tab auth state events
    const unsubscribe = subscribeToAuthChanges((type, payload) => {
      if (type === "LOGIN" && payload) {
        setUser(payload as User);
        setAuthModalOpen(false);
      } else if (type === "LOGOUT") {
        setUser(null);
      }
    });

    // Listen to modal trigger from 401s in apiClient
    const handleTriggerModal = () => {
      setAuthModalOpen(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("sb_trigger_login_modal", handleTriggerModal);
    }

    return () => {
      mounted = false;
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("sb_trigger_login_modal", handleTriggerModal);
      }
    };
  }, [refreshAuth]);

  const login = async (username: string, passkey: string): Promise<User> => {
    const res = await apiClient.auth.login(username, passkey);
    setUser(res.user);
    setAuthModalOpen(false);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    await apiClient.auth.logout();
    setUser(null);
  };

  const openLoginModal = () => setAuthModalOpen(true);

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
