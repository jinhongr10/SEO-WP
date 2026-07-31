import { postForm, postJson, requestJson } from "./apiClient";

export type SkillPackSourceType = "company" | "product" | "keyword" | "general";
export type SkillPackStatus = "draft" | "published" | "archived" | string;
export type KnowledgeExtractionStatus = "pending" | "ready" | "extracting" | "completed" | "failed" | string;
export type KnowledgeReviewStatus = "unreviewed" | "reviewed" | "rejected" | string;
export type KnowledgeArtifactKind = "company" | "product" | "keyword" | "field_rules" | "general" | string;
export type KnowledgeArtifactStatus = "draft" | "reviewed" | "rejected" | "archived" | string;

export interface ClientKnowledgeSource {
  id: string;
  label: string;
  sourceType: SkillPackSourceType;
  filename: string;
  contentType: string;
  size: number;
  chars: number;
  enabled: boolean;
  extractionStatus: KnowledgeExtractionStatus;
  artifactIds: string[];
  reviewStatus: KnowledgeReviewStatus;
  createdAt: string;
}

export interface ClientKnowledgeArtifact {
  id: string;
  kind: KnowledgeArtifactKind;
  title: string;
  markdown: string;
  sourceIds: string[];
  status: KnowledgeArtifactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClientRulePack {
  version: number;
  fieldRules: Record<string, string>;
  taskContexts: Record<string, string>;
  sourceArtifactIds: string[];
  status: string;
  updatedAt: string;
}

export interface GenerationOutputVersion {
  version: number;
  output: Record<string, unknown>;
  feedback: string;
  createdAt: string;
}

export interface GenerationFeedbackEntry {
  id: string;
  text: string;
  createdAt: string;
}

export interface GenerationSession {
  id: string;
  targetType: string;
  targetId: string;
  selectedFields: string[];
  promptInputs: Record<string, unknown>;
  outputVersions: GenerationOutputVersion[];
  feedback: GenerationFeedbackEntry[];
  acceptedVersion: number;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientSkillPack {
  id: string;
  clientName: string;
  siteUrl: string;
  version: number;
  status: SkillPackStatus;
  companySkill: Record<string, unknown>;
  productSkill: Record<string, unknown>;
  keywordSkill: Record<string, unknown>;
  taskSkills: Record<string, unknown>;
  sourceFiles: ClientKnowledgeSource[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface ClientKnowledgeSourcesResponse {
  sources: ClientKnowledgeSource[];
}

export interface ClientKnowledgeImportResponse {
  source: ClientKnowledgeSource;
}

export interface ClientKnowledgeArtifactsResponse {
  artifacts: ClientKnowledgeArtifact[];
}

export interface ClientKnowledgeClearResponse {
  cleared: number;
  sources: ClientKnowledgeSource[];
  artifacts: ClientKnowledgeArtifact[];
}

export interface ClientRulePackResponse {
  rulePack: ClientRulePack;
}

export interface GenerationSessionResponse {
  session: GenerationSession;
}

export interface ClientSkillPacksResponse {
  activeSkillPackId: string;
  skillPacks: ClientSkillPack[];
}

export interface ClientSkillPackResponse {
  skillPack: ClientSkillPack;
}

export interface SkillPackUpdatePayload {
  companySkill?: Record<string, unknown>;
  productSkill?: Record<string, unknown>;
  keywordSkill?: Record<string, unknown>;
  taskSkills?: Record<string, unknown>;
  status?: SkillPackStatus;
}

export interface KnowledgeArtifactsUpdatePayload {
  artifacts: Array<Partial<ClientKnowledgeArtifact>>;
}

export interface RulePackUpdatePayload {
  version?: number;
  fieldRules?: Record<string, string>;
  taskContexts?: Record<string, string>;
  sourceArtifactIds?: string[];
  status?: string;
  updatedAt?: string;
}

export interface GenerationSessionPayload {
  targetType: string;
  targetId?: string;
  selectedFields?: string[];
  promptInputs?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface GenerationSessionFeedbackPayload {
  feedback: string;
  selectedFields?: string[];
  promptInputs?: Record<string, unknown>;
  acceptedVersion?: number;
  syncStatus?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid skill pack response: ${label}`);
  }
  return value;
};

const optionalString = (value: unknown): string => (
  typeof value === "string" ? value : ""
);

const stringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(item => String(item || "").trim()).filter(Boolean)
    : []
);

const requireNumber = (value: unknown, label: string): number => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`Invalid skill pack response: ${label}`);
  }
  return numberValue;
};

const normalizeSourceType = (value: unknown): SkillPackSourceType => {
  const cleaned = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (cleaned === "company" || cleaned === "product" || cleaned === "keyword") return cleaned;
  return "general";
};

export const validateClientKnowledgeSource = (
  source: unknown,
  index = 0,
): ClientKnowledgeSource => {
  if (!isRecord(source)) {
    throw new Error(`Invalid skill pack response: knowledge source ${index}`);
  }
  return {
    id: requireString(source.id, `knowledge source id ${index}`),
    label: requireString(source.label, `knowledge source label ${index}`),
    sourceType: normalizeSourceType(source.sourceType),
    filename: requireString(source.filename, `knowledge source filename ${index}`),
    contentType: optionalString(source.contentType) || "text/plain",
    size: requireNumber(source.size, `knowledge source size ${index}`),
    chars: requireNumber(source.chars, `knowledge source chars ${index}`),
    enabled: source.enabled !== false,
    extractionStatus: optionalString(source.extractionStatus) || "pending",
    artifactIds: stringList(source.artifactIds),
    reviewStatus: optionalString(source.reviewStatus) || "unreviewed",
    createdAt: optionalString(source.createdAt),
  };
};

export const validateKnowledgeArtifact = (
  artifact: unknown,
  index = 0,
): ClientKnowledgeArtifact => {
  if (!isRecord(artifact)) {
    throw new Error(`Invalid skill pack response: knowledge artifact ${index}`);
  }
  return {
    id: requireString(artifact.id, `knowledge artifact id ${index}`),
    kind: optionalString(artifact.kind) || "general",
    title: requireString(artifact.title, `knowledge artifact title ${index}`),
    markdown: typeof artifact.markdown === "string" ? artifact.markdown : "",
    sourceIds: stringList(artifact.sourceIds),
    status: optionalString(artifact.status) || "draft",
    createdAt: optionalString(artifact.createdAt),
    updatedAt: optionalString(artifact.updatedAt),
  };
};

const stringRecord = (value: unknown, label: string): Record<string, string> => {
  if (!isRecord(value)) {
    throw new Error(`Invalid skill pack response: ${label}`);
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = typeof item === "string" ? item : String(item ?? "");
  }
  return out;
};

export const emptyRulePack = (): ClientRulePack => ({
  version: 0,
  fieldRules: {},
  taskContexts: {},
  sourceArtifactIds: [],
  status: "draft",
  updatedAt: "",
});

export const validateRulePack = (rulePack: unknown): ClientRulePack => {
  if (!isRecord(rulePack)) {
    throw new Error("Invalid skill pack response: rule pack");
  }
  return {
    version: Number.isFinite(Number(rulePack.version)) ? Number(rulePack.version) : 0,
    fieldRules: stringRecord(rulePack.fieldRules, "rule pack field rules"),
    taskContexts: stringRecord(rulePack.taskContexts, "rule pack task contexts"),
    sourceArtifactIds: stringList(rulePack.sourceArtifactIds),
    status: optionalString(rulePack.status) || "draft",
    updatedAt: optionalString(rulePack.updatedAt),
  };
};

const validateGenerationOutputVersion = (
  version: unknown,
  index: number,
): GenerationOutputVersion => {
  if (!isRecord(version)) {
    throw new Error(`Invalid skill pack response: generation output version ${index}`);
  }
  return {
    version: requireNumber(version.version, `generation output version ${index}`),
    output: isRecord(version.output) ? version.output : {},
    feedback: optionalString(version.feedback),
    createdAt: optionalString(version.createdAt),
  };
};

const validateGenerationFeedbackEntry = (
  feedback: unknown,
  index: number,
): GenerationFeedbackEntry => {
  if (!isRecord(feedback)) {
    throw new Error(`Invalid skill pack response: generation feedback ${index}`);
  }
  return {
    id: requireString(feedback.id, `generation feedback id ${index}`),
    text: typeof feedback.text === "string" ? feedback.text : "",
    createdAt: optionalString(feedback.createdAt),
  };
};

export const validateGenerationSession = (
  session: unknown,
): GenerationSession => {
  if (!isRecord(session)) {
    throw new Error("Invalid skill pack response: generation session");
  }
  return {
    id: requireString(session.id, "generation session id"),
    targetType: requireString(session.targetType, "generation session target type"),
    targetId: optionalString(session.targetId),
    selectedFields: stringList(session.selectedFields),
    promptInputs: isRecord(session.promptInputs) ? session.promptInputs : {},
    outputVersions: Array.isArray(session.outputVersions)
      ? session.outputVersions.map(validateGenerationOutputVersion)
      : [],
    feedback: Array.isArray(session.feedback)
      ? session.feedback.map(validateGenerationFeedbackEntry)
      : [],
    acceptedVersion: Number.isFinite(Number(session.acceptedVersion)) ? Number(session.acceptedVersion) : 0,
    syncStatus: optionalString(session.syncStatus) || "draft",
    createdAt: optionalString(session.createdAt),
    updatedAt: optionalString(session.updatedAt),
  };
};

export const validateSkillPack = (pack: unknown, index = 0): ClientSkillPack => {
  if (!isRecord(pack)) {
    throw new Error(`Invalid skill pack response: skill pack ${index}`);
  }
  return {
    id: requireString(pack.id, `skill pack id ${index}`),
    clientName: optionalString(pack.clientName),
    siteUrl: optionalString(pack.siteUrl),
    version: requireNumber(pack.version, `skill pack version ${index}`),
    status: requireString(pack.status, `skill pack status ${index}`),
    companySkill: isRecord(pack.companySkill) ? pack.companySkill : {},
    productSkill: isRecord(pack.productSkill) ? pack.productSkill : {},
    keywordSkill: isRecord(pack.keywordSkill) ? pack.keywordSkill : {},
    taskSkills: isRecord(pack.taskSkills) ? pack.taskSkills : {},
    sourceFiles: Array.isArray(pack.sourceFiles)
      ? pack.sourceFiles.map(validateClientKnowledgeSource)
      : [],
    createdAt: optionalString(pack.createdAt),
    updatedAt: optionalString(pack.updatedAt),
    publishedAt: optionalString(pack.publishedAt),
  };
};

export const validateKnowledgeSourcesResponse = (
  data: unknown,
): ClientKnowledgeSourcesResponse => {
  if (!isRecord(data) || !Array.isArray(data.sources)) {
    throw new Error("Invalid skill pack response: knowledge sources");
  }
  return { sources: data.sources.map(validateClientKnowledgeSource) };
};

export const validateKnowledgeImportResponse = (
  data: unknown,
): ClientKnowledgeImportResponse => {
  if (!isRecord(data) || !isRecord(data.source)) {
    throw new Error("Invalid skill pack response: imported knowledge source");
  }
  return { source: validateClientKnowledgeSource(data.source) };
};

export const validateKnowledgeArtifactsResponse = (
  data: unknown,
): ClientKnowledgeArtifactsResponse => {
  if (!isRecord(data) || !Array.isArray(data.artifacts)) {
    throw new Error("Invalid skill pack response: knowledge artifacts");
  }
  return { artifacts: data.artifacts.map(validateKnowledgeArtifact) };
};

export const validateKnowledgeClearResponse = (
  data: unknown,
): ClientKnowledgeClearResponse => {
  if (!isRecord(data) || !Array.isArray(data.sources) || !Array.isArray(data.artifacts)) {
    throw new Error("Invalid skill pack response: cleared knowledge sources");
  }
  return {
    cleared: Number.isFinite(Number(data.cleared)) ? Number(data.cleared) : 0,
    sources: data.sources.map(validateClientKnowledgeSource),
    artifacts: data.artifacts.map(validateKnowledgeArtifact),
  };
};

export const validateRulePackResponse = (
  data: unknown,
): ClientRulePackResponse => {
  if (!isRecord(data) || !isRecord(data.rulePack)) {
    throw new Error("Invalid skill pack response: rule pack");
  }
  return { rulePack: validateRulePack(data.rulePack) };
};

export const validateGenerationSessionResponse = (
  data: unknown,
): GenerationSessionResponse => {
  if (!isRecord(data) || !isRecord(data.session)) {
    throw new Error("Invalid skill pack response: generation session");
  }
  return { session: validateGenerationSession(data.session) };
};

export const validateSkillPacksResponse = (data: unknown): ClientSkillPacksResponse => {
  if (!isRecord(data) || !Array.isArray(data.skillPacks)) {
    throw new Error("Invalid skill pack response: skill packs");
  }
  return {
    activeSkillPackId: optionalString(data.activeSkillPackId),
    skillPacks: data.skillPacks.map(validateSkillPack),
  };
};

export const validateSkillPackResponse = (data: unknown): ClientSkillPackResponse => {
  if (!isRecord(data) || !isRecord(data.skillPack)) {
    throw new Error("Invalid skill pack response: skill pack");
  }
  return { skillPack: validateSkillPack(data.skillPack) };
};

export const fetchClientKnowledgeSources = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientKnowledgeSourcesResponse> => (
  validateKnowledgeSourcesResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/knowledge`, undefined, apiBase),
  )
);

export const importClientKnowledgeFile = async (
  profileId: string,
  file: File,
  sourceType: SkillPackSourceType,
  label: string,
  apiBase = "/api",
): Promise<ClientKnowledgeImportResponse> => {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("sourceType", sourceType);
  form.append("label", label.trim() || file.name);
  return validateKnowledgeImportResponse(
    await postForm<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/knowledge/import`, form, apiBase),
  );
};

export const extractKnowledgeSource = async (
  profileId: string,
  sourceId: string,
  apiBase = "/api",
): Promise<ClientKnowledgeArtifactsResponse> => (
  validateKnowledgeArtifactsResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/knowledge/${encodeURIComponent(sourceId)}/extract`, {
      method: "POST",
    }, apiBase),
  )
);

export const clearClientKnowledgeSources = async (
  profileId: string,
  sourceType: SkillPackSourceType,
  apiBase = "/api",
): Promise<ClientKnowledgeClearResponse> => (
  validateKnowledgeClearResponse(
    await requestJson<unknown>(
      `/site-profiles/${encodeURIComponent(profileId)}/knowledge?sourceType=${encodeURIComponent(sourceType)}`,
      { method: "DELETE" },
      apiBase,
    ),
  )
);

export const fetchKnowledgeArtifacts = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientKnowledgeArtifactsResponse> => (
  validateKnowledgeArtifactsResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/knowledge/artifacts`, undefined, apiBase),
  )
);

export const saveKnowledgeArtifacts = async (
  profileId: string,
  artifacts: Array<Partial<ClientKnowledgeArtifact>>,
  apiBase = "/api",
): Promise<ClientKnowledgeArtifactsResponse> => (
  validateKnowledgeArtifactsResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/knowledge/artifacts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifacts }),
    }, apiBase),
  )
);

export const fetchRulePack = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientRulePackResponse> => (
  validateRulePackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/rules`, undefined, apiBase),
  )
);

export const generateRulePack = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientRulePackResponse> => (
  validateRulePackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/rules/generate`, {
      method: "POST",
    }, apiBase),
  )
);

export const saveRulePack = async (
  profileId: string,
  rulePack: RulePackUpdatePayload,
  apiBase = "/api",
): Promise<ClientRulePackResponse> => (
  validateRulePackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rulePack }),
    }, apiBase),
  )
);

export const createGenerationSession = async (
  profileId: string,
  payload: GenerationSessionPayload,
  apiBase = "/api",
): Promise<GenerationSessionResponse> => (
  validateGenerationSessionResponse(
    await postJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/generation-sessions`, payload, apiBase),
  )
);

export const sendGenerationFeedback = async (
  profileId: string,
  sessionId: string,
  payload: GenerationSessionFeedbackPayload,
  apiBase = "/api",
): Promise<GenerationSessionResponse> => (
  validateGenerationSessionResponse(
    await postJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/generation-sessions/${encodeURIComponent(sessionId)}/feedback`, payload, apiBase),
  )
);

export const fetchSkillPacks = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientSkillPacksResponse> => (
  validateSkillPacksResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/skill-packs`, undefined, apiBase),
  )
);

export const generateSkillPack = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientSkillPackResponse> => (
  validateSkillPackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/skill-packs/generate`, {
      method: "POST",
    }, apiBase),
  )
);

export const fetchActiveSkillPack = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientSkillPackResponse> => (
  validateSkillPackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/skill-packs/active`, undefined, apiBase),
  )
);

export const updateSkillPack = async (
  profileId: string,
  packId: string,
  payload: SkillPackUpdatePayload,
  apiBase = "/api",
): Promise<ClientSkillPackResponse> => (
  validateSkillPackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/skill-packs/${encodeURIComponent(packId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, apiBase),
  )
);

export const publishSkillPack = async (
  profileId: string,
  packId: string,
  apiBase = "/api",
): Promise<ClientSkillPackResponse> => (
  validateSkillPackResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/skill-packs/${encodeURIComponent(packId)}/publish`, {
      method: "POST",
    }, apiBase),
  )
);
