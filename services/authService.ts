import { clearApiAuthToken, postJson, requestJson, setApiAuthToken } from "./apiClient";

export interface AuthBootstrapStatus {
  registered: boolean;
  requiresLogin: boolean;
  setupComplete: boolean;
}

export interface LocalAuthSession {
  ok: boolean;
  token: string;
  username: string;
  setupComplete?: boolean;
}

const requireBoolean = (value: unknown, label: string) => {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid auth response: ${label}`);
  }
  return value;
};

const validateBootstrapStatus = (result: AuthBootstrapStatus): AuthBootstrapStatus => ({
  registered: requireBoolean(result?.registered, "registered"),
  requiresLogin: requireBoolean(result?.requiresLogin, "requiresLogin"),
  setupComplete: requireBoolean(result?.setupComplete, "setupComplete"),
});

const validateSession = (result: LocalAuthSession): LocalAuthSession => {
  if (!result?.ok) {
    throw new Error("Auth request failed");
  }
  if (typeof result.token !== "string" || !result.token.trim()) {
    throw new Error("Auth response missing token");
  }
  if (typeof result.username !== "string" || !result.username.trim()) {
    throw new Error("Auth response missing username");
  }
  return { ...result, token: result.token.trim(), username: result.username.trim() };
};

const storeSession = (session: LocalAuthSession) => {
  setApiAuthToken(session.token);
  return session;
};

export const fetchAuthBootstrapStatus = (apiBase = "/api"): Promise<AuthBootstrapStatus> => (
  requestJson<AuthBootstrapStatus>("/auth/bootstrap-status", undefined, apiBase)
    .then(validateBootstrapStatus)
);

export const registerLocalAccount = (
  username: string,
  password: string,
  apiBase = "/api",
): Promise<LocalAuthSession> => (
  postJson<LocalAuthSession>("/auth/register", { username, password }, apiBase)
    .then(validateSession)
    .then(storeSession)
);

export const loginLocalAccount = (
  username: string,
  password: string,
  apiBase = "/api",
): Promise<LocalAuthSession> => (
  postJson<LocalAuthSession>("/auth/login", { username, password }, apiBase)
    .then(validateSession)
    .then(storeSession)
);

export const logoutLocalAccount = async (apiBase = "/api"): Promise<void> => {
  try {
    await postJson<{ ok: boolean }>("/auth/logout", {}, apiBase);
  } finally {
    clearApiAuthToken();
  }
};
