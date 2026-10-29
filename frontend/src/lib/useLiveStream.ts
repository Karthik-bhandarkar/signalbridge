"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type StreamStatus = "live" | "polling" | "reconnecting" | "offline";

export interface UseLiveStreamOptions {
  url?: string;
  onIncidentUpdate?: (data: any[]) => void;
  onPing?: (telemetry: any) => void;
  pollIntervalMs?: number;
  pollFallbackIntervalMs?: number;
  onPoll?: () => void;
  onPollTick?: () => void;
}

export function useLiveStream({
  url = "/api/v1/stream/",
  onIncidentUpdate,
  onPing,
  pollIntervalMs = 3500,
  pollFallbackIntervalMs,
  onPoll,
  onPollTick,
}: UseLiveStreamOptions = {}) {
  const fallbackInterval = pollFallbackIntervalMs ?? pollIntervalMs;
  const pollCallback = onPoll ?? onPollTick;

  const [status, setStatus] = useState<StreamStatus>("reconnecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const failureCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const onIncidentUpdateRef = useRef(onIncidentUpdate);
  const onPingRef = useRef(onPing);
  const onPollRef = useRef(pollCallback);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onIncidentUpdateRef.current = onIncidentUpdate;
    onPingRef.current = onPing;
    onPollRef.current = pollCallback;
  }, [onIncidentUpdate, onPing, pollCallback]);

  const startPollingFallback = useCallback(() => {
    if (pollIntervalRef.current) return;
    setStatus("polling");
    if (onPollRef.current) {
      onPollRef.current();
    }
    pollIntervalRef.current = setInterval(() => {
      if (onPollRef.current) {
        onPollRef.current();
      }
    }, fallbackInterval);
  }, [fallbackInterval]);

  const stopPollingFallback = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (typeof window === "undefined" || !("EventSource" in window)) {
      startPollingFallback();
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isMountedRef.current) return;
        failureCountRef.current = 0;
        setStatus("live");
        stopPollingFallback();
      };

      es.addEventListener("incident_update", (e) => {
        if (!isMountedRef.current) return;
        try {
          const parsed = JSON.parse(e.data);
          if (Array.isArray(parsed) && onIncidentUpdateRef.current) {
            onIncidentUpdateRef.current(parsed);
          }
        } catch {
          // Ignore JSON parse error
        }
      });

      es.addEventListener("ping", (e) => {
        if (!isMountedRef.current) return;
        try {
          const parsed = JSON.parse(e.data);
          if (onPingRef.current) {
            onPingRef.current(parsed);
          }
        } catch {
          // Ignore ping parse error
        }
      });

      es.onerror = () => {
        if (!isMountedRef.current) return;
        es.close();
        eventSourceRef.current = null;
        failureCountRef.current += 1;

        if (failureCountRef.current >= 3) {
          startPollingFallback();
        } else {
          setStatus("reconnecting");
          const delay = Math.min(1000 * Math.pow(2, failureCountRef.current), 8000);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, delay);
        }
      };
    } catch {
      startPollingFallback();
    }
  }, [url, startPollingFallback, stopPollingFallback]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopPollingFallback();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, stopPollingFallback]);

  return {
    status,
    isLive: status === "live",
    isPolling: status === "polling",
  };
}
