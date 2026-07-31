import React, { useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import { Button as ArcoButton, Input as ArcoInput } from "@arco-design/web-react";
import {
  createGenerationSession,
  sendGenerationFeedback,
} from "../services/skillPackService";
import { IconRefresh, IconSparkles } from "./Icons";

type Theme = {
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

export interface InlineGenerationFeedbackProps {
  theme: Theme;
  backendUrl?: string;
  siteId: string;
  targetType: "blog_post" | "page" | "woocommerce_product" | "image_seo";
  targetId?: string;
  fieldKey?: string;
  currentOutput: Record<string, unknown>;
  promptInputs?: Record<string, unknown>;
  title?: string;
  description?: string;
  placeholder?: string;
  buttonLabel?: string;
  onRevisedOutput(output: Record<string, unknown>): void;
}

const latestSessionOutput = (session: { outputVersions?: Array<{ output: Record<string, unknown> }> }) => {
  const versions = Array.isArray(session.outputVersions) ? session.outputVersions : [];
  return versions[versions.length - 1]?.output || {};
};

export const InlineGenerationFeedback: React.FC<InlineGenerationFeedbackProps> = ({
  theme,
  backendUrl = "/api",
  siteId,
  targetType,
  targetId = "",
  fieldKey,
  currentOutput,
  promptInputs = {},
  title = "字段反馈",
  description = "直接写修改意见，再用 Gemini 生成新版。",
  placeholder = "例如：SEO 标题把型号放前面，正文 CTA 更偏询盘，不要写价格。",
  buttonLabel = "Gemini 修改",
  onRevisedOutput,
}) => {
  const [feedback, setFeedback] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedFields = useMemo(() => (
    fieldKey ? [fieldKey] : Object.keys(currentOutput || {}).filter(Boolean)
  ), [currentOutput, fieldKey]);

  const handleSubmit = async () => {
    if (!siteId || !feedback.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      let nextSessionId = sessionId;
      if (!nextSessionId) {
        const created = await createGenerationSession(siteId, {
          targetType,
          targetId,
          selectedFields,
          promptInputs,
          output: currentOutput,
        }, backendUrl);
        nextSessionId = created.session.id;
        setSessionId(nextSessionId);
      }

      const revised = await sendGenerationFeedback(siteId, nextSessionId, {
        feedback,
        selectedFields,
        promptInputs,
      }, backendUrl);
      const output = latestSessionOutput(revised.session);
      if (Object.keys(output).length) {
        onRevisedOutput(output);
      }
      setFeedback("");
      setMessage("已根据反馈生成新版，请检查后再保存或发布。");
    } catch (err: any) {
      setMessage(`反馈迭代失败：${formatUserFacingError(err, "AI 反馈迭代")}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="inline-generation-feedback" className={`rounded-lg border ${theme.cardBorder} bg-[var(--system-surface-strong)] p-3`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className={`flex items-center gap-2 text-sm font-bold ${theme.heading}`}>
            <IconSparkles className="size-4" /> {title}
          </div>
          <div className={`mt-0.5 text-xs ${theme.subText}`}>{description}</div>
        </div>
        {busy && <IconRefresh className="size-4 animate-spin text-blue-500" />}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ArcoInput
          value={feedback}
          onChange={setFeedback}
          className="min-w-0 flex-1"
          placeholder={placeholder}
        />
        <ArcoButton
          type="primary"
          onClick={handleSubmit}
          disabled={!feedback.trim() || busy || !siteId}
        >
          {busy ? "生成中..." : buttonLabel}
        </ArcoButton>
      </div>
      {message && (
        <div className={`mt-2 text-xs ${message.includes("失败") ? "text-red-600 dark:text-red-300" : theme.subText}`}>
          {message}
        </div>
      )}
    </div>
  );
};
