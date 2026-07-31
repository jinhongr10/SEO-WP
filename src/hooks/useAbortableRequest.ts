import { useCallback, useRef } from "react";

export const isAbortError = (error: unknown) => (
  error instanceof DOMException && error.name === "AbortError"
);

export const useAbortableRequest = <AbortReason extends string>() => {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<AbortReason | null>(null);

  const beginRequest = useCallback((restartReason: AbortReason) => {
    requestIdRef.current += 1;
    const id = requestIdRef.current;
    if (abortControllerRef.current) {
      abortReasonRef.current = restartReason;
      abortControllerRef.current.abort();
    }
    abortReasonRef.current = null;
    return id;
  }, []);

  const createAbortController = useCallback(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const clearAbortController = useCallback((controller: AbortController) => {
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null;
    }
  }, []);

  const isActiveController = useCallback((controller: AbortController) => (
    abortControllerRef.current === controller
  ), []);

  const isCurrentRequest = useCallback((id: number) => requestIdRef.current === id, []);

  const getAbortReason = useCallback(() => abortReasonRef.current, []);

  const setAbortReason = useCallback((reason: AbortReason | null) => {
    abortReasonRef.current = reason;
  }, []);

  const hasActiveController = useCallback(() => Boolean(abortControllerRef.current), []);

  const abortCurrent = useCallback((reason: AbortReason) => {
    requestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortReasonRef.current = reason;
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    abortCurrent,
    beginRequest,
    clearAbortController,
    createAbortController,
    getAbortReason,
    hasActiveController,
    isActiveController,
    isCurrentRequest,
    setAbortReason,
  };
};
