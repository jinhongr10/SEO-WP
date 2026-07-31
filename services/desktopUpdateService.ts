export type DesktopUpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase;
  currentVersion: string;
  latestVersion: string;
  progress: number;
  lastCheckedAt: string;
  errorMessage: string;
}

type DesktopUpdateBridge = {
  getUpdateStatus?: () => Promise<unknown>;
  checkForUpdates?: () => Promise<unknown>;
  installUpdate?: () => Promise<unknown>;
  onUpdateStatus?: (callback: (status: unknown) => void) => () => void;
};

const SUPPORTED_PHASES = new Set<DesktopUpdatePhase>([
  "unsupported",
  "idle",
  "checking",
  "available",
  "downloading",
  "downloaded",
  "not-available",
  "error",
]);

export const DEFAULT_DESKTOP_UPDATE_STATUS: DesktopUpdateStatus = {
  phase: "unsupported",
  currentVersion: "",
  latestVersion: "",
  progress: 0,
  lastCheckedAt: "",
  errorMessage: "",
};

const getDesktopBridge = (): DesktopUpdateBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { seoWpSyncDesktop?: DesktopUpdateBridge }).seoWpSyncDesktop;
};

const normalizeProgress = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
};

const cleanString = (value: unknown) => (typeof value === "string" ? value : "");

export const normalizeDesktopUpdateStatus = (value: unknown): DesktopUpdateStatus => {
  if (!value || typeof value !== "object") return { ...DEFAULT_DESKTOP_UPDATE_STATUS };
  const source = value as Record<string, unknown>;
  const rawPhase = cleanString(source.phase) as DesktopUpdatePhase;
  const phase = SUPPORTED_PHASES.has(rawPhase) ? rawPhase : "idle";

  return {
    phase,
    currentVersion: cleanString(source.currentVersion),
    latestVersion: cleanString(source.latestVersion),
    progress: normalizeProgress(source.progress),
    lastCheckedAt: cleanString(source.lastCheckedAt),
    errorMessage: cleanString(source.errorMessage),
  };
};

export const getDesktopUpdateStatus = async (): Promise<DesktopUpdateStatus> => {
  const bridge = getDesktopBridge();
  if (!bridge?.getUpdateStatus) return { ...DEFAULT_DESKTOP_UPDATE_STATUS };
  return normalizeDesktopUpdateStatus(await bridge.getUpdateStatus());
};

export const checkForDesktopUpdates = async (): Promise<DesktopUpdateStatus> => {
  const bridge = getDesktopBridge();
  if (!bridge?.checkForUpdates) return { ...DEFAULT_DESKTOP_UPDATE_STATUS };
  return normalizeDesktopUpdateStatus(await bridge.checkForUpdates());
};

export const installDesktopUpdate = async (): Promise<DesktopUpdateStatus> => {
  const bridge = getDesktopBridge();
  if (!bridge?.installUpdate) return { ...DEFAULT_DESKTOP_UPDATE_STATUS };
  return normalizeDesktopUpdateStatus(await bridge.installUpdate());
};

export const subscribeDesktopUpdateStatus = (callback: (status: DesktopUpdateStatus) => void) => {
  const bridge = getDesktopBridge();
  if (!bridge?.onUpdateStatus) return () => {};
  return bridge.onUpdateStatus(status => callback(normalizeDesktopUpdateStatus(status)));
};
