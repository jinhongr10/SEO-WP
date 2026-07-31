import { requestJson } from "./apiClient";

export interface AiStatus {
  ok: boolean;
  provider: string;
  configured?: boolean;
  project?: string;
  location?: string;
  credentialsPath?: string;
  credentialsFileExists?: boolean | null;
  model: string;
  detail?: string;
  verified?: boolean;
  probeAgeSeconds?: number | null;
  probeOk?: boolean;
  probeText?: string;
}

const validateAiStatusMetadata = (status: AiStatus): AiStatus => {
  if (typeof status?.ok !== "boolean") {
    throw new Error("AI status response has invalid ok");
  }
  if (status.configured !== undefined && typeof status.configured !== "boolean") {
    throw new Error("AI status response has invalid configured");
  }
  if (
    status.credentialsFileExists !== undefined
    && status.credentialsFileExists !== null
    && typeof status.credentialsFileExists !== "boolean"
  ) {
    throw new Error("AI status response has invalid credentials file state");
  }
  if (status.probeOk !== undefined && typeof status.probeOk !== "boolean") {
    throw new Error("AI status response has invalid probe state");
  }
  if (status.verified !== undefined && typeof status.verified !== "boolean") {
    throw new Error("AI status response has invalid verified state");
  }
  if (
    status.probeAgeSeconds !== undefined
    && status.probeAgeSeconds !== null
    && typeof status.probeAgeSeconds !== "number"
  ) {
    throw new Error("AI status response has invalid probe age");
  }
  if (!status?.ok) return status;
  if (!String(status.provider || "").trim()) {
    throw new Error("AI status response missing provider");
  }
  if (!String(status.model || "").trim()) {
    throw new Error("AI status response missing model");
  }
  return status;
};

const assertAiReady = (status: AiStatus) => {
  if (!status.ok) {
    throw new Error(status.detail || "AI connection test failed");
  }
  return validateAiStatusMetadata(status);
};

export const fetchAiStatus = (): Promise<AiStatus> => (
  requestJson<AiStatus>("/ai/status").then(validateAiStatusMetadata)
);

export const probeAiStatus = async (): Promise<AiStatus> => (
  assertAiReady(await requestJson<AiStatus>("/ai/status?probe=true"))
);
