import { useEffect, useRef } from "react";

type PollingCallback = () => void | Promise<void>;

export type UsePollingOptions = {
  enabled?: boolean;
  intervalMs: number;
  immediate?: boolean;
  onError?: (error: unknown) => void;
};

export const usePolling = (
  callback: PollingCallback,
  {
    enabled = true,
    intervalMs,
    immediate = false,
    onError,
  }: UsePollingOptions,
) => {
  const callbackRef = useRef(callback);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0 || typeof window === "undefined") return undefined;

    let stopped = false;
    let running = false;

    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        await callbackRef.current();
      } catch (error) {
        onErrorRef.current?.(error);
      } finally {
        running = false;
      }
    };

    if (immediate) {
      void tick();
    }

    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, immediate, intervalMs]);
};
