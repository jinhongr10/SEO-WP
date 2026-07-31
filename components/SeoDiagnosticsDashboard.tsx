import React, { useCallback, useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Card as ArcoCard,
  Input as ArcoInput,
  Select as ArcoSelect,
  Table as ArcoTable,
} from "@arco-design/web-react";
import {
  fetchSeoDiagnosticsSummary,
  refreshSeoDiagnostics,
  SeoDiagnosisPage,
  SeoDiagnosticsSummary,
} from "../services/seoDiagnosticsService";
import { IconDocumentText, IconRefresh, IconSparkles } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

interface Filters {
  role: string;
  priority: string;
  sourceGap: string;
  search: string;
}

interface SeoDiagnosticsDashboardProps {
  theme: Theme;
  backendUrl?: string;
  initialSummary?: SeoDiagnosticsSummary;
  onNavigate?: (mode: string, options?: { filter?: string }) => void;
}

const roleLabel: Record<string, string> = {
  product: "产品页",
  blog: "Blog",
  product_category: "产品分类页",
  unknown: "未知",
};

const priorityLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const priorityClass: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300",
  medium: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  low: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
};

export const filterSeoDiagnosticsPages = (pages: SeoDiagnosisPage[], filters: Filters) => pages.filter(page => {
  if (filters.role && page.pageRole !== filters.role) return false;
  if (filters.priority && page.priority !== filters.priority) return false;
  if (filters.sourceGap && !page.sourceGaps.includes(filters.sourceGap)) return false;
  const search = filters.search.trim().toLowerCase();
  if (search && !`${page.title} ${page.url} ${page.finding}`.toLowerCase().includes(search)) return false;
  return true;
});

const StatBox: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone = "" }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-black ${tone || "text-slate-900 dark:text-white"}`}>{value}</div>
  </div>
);

const SourcePills: React.FC<{ sources: string[]; gaps: string[] }> = ({ sources, gaps }) => (
  <div className="flex min-w-0 flex-wrap gap-1">
    {sources.map(source => (
      <span key={source} className="max-w-full break-words rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{source.toUpperCase()}</span>
    ))}
    {gaps.map(gap => (
      <span key={gap} className="max-w-full break-words rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">缺 {gap.toUpperCase()}</span>
    ))}
  </div>
);

export const SeoDiagnosticsDashboard: React.FC<SeoDiagnosticsDashboardProps> = ({
  theme,
  backendUrl = "/api",
  initialSummary,
  onNavigate,
}) => {
  const [summary, setSummary] = useState<SeoDiagnosticsSummary | null>(() => initialSummary || null);
  const [loading, setLoading] = useState(() => !initialSummary);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>({ role: "", priority: "", sourceGap: "", search: "" });
  const [selected, setSelected] = useState<SeoDiagnosisPage | null>(() => initialSummary?.pages?.[0] || null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await fetchSeoDiagnosticsSummary(28, backendUrl);
      setSummary(result);
      setSelected(result.pages?.[0] || null);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 诊断"));
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const handleRefresh = async () => {
    try {
      setBusy("refresh");
      setError("");
      const result = await refreshSeoDiagnostics(28, backendUrl);
      setSummary(result);
      setSelected(result.pages?.[0] || null);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 诊断"));
    } finally {
      setBusy("");
    }
  };

  React.useEffect(() => {
    if (!initialSummary) loadSummary();
  }, [initialSummary, loadSummary]);

  const pages = useMemo(() => filterSeoDiagnosticsPages(summary?.pages || [], filters), [summary, filters]);

  if (loading && !summary) {
    return <div className="flex-1 p-6"><div className={theme.subText}>正在加载数据洞察...</div></div>;
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={`text-xl font-black ${theme.heading}`}>数据洞察</h1>
            <p className={`mt-1 text-sm ${theme.subText}`}>SEO 效果分析：把 GSC、WordPress 和 SEO 审计翻译成运营动作。</p>
          </div>
          <ArcoButton type="primary" onClick={handleRefresh} disabled={busy === "refresh"} icon={<IconRefresh className={`size-4 ${busy === "refresh" ? "animate-spin" : ""}`} />}>
            {busy === "refresh" ? "刷新中" : "刷新诊断"}
          </ArcoButton>
        </div>

        {error && <ArcoAlert type="error" content={error} showIcon />}
        {summary?.sourceWarnings?.length ? (
          <ArcoAlert type="warning" showIcon content={(
            <div>{summary.sourceWarnings.map(warning => <div key={warning}>{warning}</div>)}</div>
          )} />
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatBox label="分析页面" value={summary?.totalPages || 0} />
          <StatBox label="高优先级" value={summary?.highPriority || 0} tone="text-red-600 dark:text-red-300" />
          <StatBox label="中优先级" value={summary?.mediumPriority || 0} tone="text-amber-600 dark:text-amber-300" />
          <StatBox label="低优先级" value={summary?.lowPriority || 0} />
        </div>

        <ArcoCard bordered bodyStyle={{ padding: 16 }}>
          <div className="grid gap-3 md:grid-cols-4">
            <ArcoSelect value={filters.role} onChange={value => setFilters({ ...filters, role: String(value || "") })} options={[
              { value: "", label: "全部页面角色" },
              { value: "product", label: "产品页" },
              { value: "blog", label: "Blog" },
              { value: "product_category", label: "产品分类页" },
            ]} />
            <ArcoSelect value={filters.priority} onChange={value => setFilters({ ...filters, priority: String(value || "") })} options={[
              { value: "", label: "全部优先级" },
              { value: "high", label: "高" },
              { value: "medium", label: "中" },
              { value: "low", label: "低" },
            ]} />
            <ArcoSelect value={filters.sourceGap} onChange={value => setFilters({ ...filters, sourceGap: String(value || "") })} options={[
              { value: "", label: "全部数据状态" },
              { value: "gsc", label: "缺 GSC" },
              { value: "seo_audit", label: "缺 SEO 审计" },
            ]} />
            <ArcoInput value={filters.search} onChange={value => setFilters({ ...filters, search: value })} placeholder="搜索 URL / 标题" />
          </div>
        </ArcoCard>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.38fr)]">
          <div className={`min-w-0 overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
            <ArcoTable
              className="text-sm table-fixed"
              rowKey="id"
              data={pages}
              pagination={false}
              noDataElement={<div className={`px-4 py-8 text-center text-sm ${theme.subText}`}>暂无匹配诊断。</div>}
              columns={[
                {
                  title: "页面",
                  dataIndex: "title",
                  width: "39%",
                  render: (_: unknown, page: SeoDiagnosisPage) => (
                    <div className="min-w-0">
                      <ArcoButton type="text" onClick={() => setSelected(page)} className={`h-auto break-words p-0 text-left text-sm font-semibold ${theme.heading}`}>{page.title || page.path}</ArcoButton>
                      <div className={`mt-1 text-xs ${theme.subText}`}>{roleLabel[page.pageRole] || page.pageRole}</div>
                      <div className={`mt-1 break-all text-xs ${theme.subText}`}>{page.path}</div>
                    </div>
                  ),
                },
                {
                  title: "问题",
                  dataIndex: "finding",
                  width: "22%",
                  render: (_: unknown, page: SeoDiagnosisPage) => (
                    <>
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityClass[page.priority]}`}>{priorityLabel[page.priority]}</span>
                      <div className={`mt-2 break-words text-sm ${theme.heading}`}>{page.finding}</div>
                    </>
                  ),
                },
                {
                  title: "证据来源",
                  dataIndex: "sources",
                  width: "20%",
                  render: (_: unknown, page: SeoDiagnosisPage) => <SourcePills sources={page.sources} gaps={page.sourceGaps} />,
                },
                {
                  title: "动作",
                  dataIndex: "nextWorkspace",
                  width: "19%",
                  align: "right",
                  render: (_: unknown, page: SeoDiagnosisPage) => page.nextWorkspace ? (
                    <ArcoButton type="primary" size="small" onClick={() => onNavigate?.(page.nextWorkspace!.viewMode, { filter: page.nextWorkspace!.filter })}>
                      {page.nextWorkspace.label}
                    </ArcoButton>
                  ) : null,
                },
              ]}
            />
          </div>

          <div className={`min-w-0 rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
            {selected ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><IconSparkles className="size-5" /></div>
                  <div className="min-w-0">
                    <h2 className={`break-words text-base font-bold ${theme.heading}`}>{selected.title}</h2>
                    <p className={`mt-1 break-all text-xs ${theme.subText}`}>{selected.url}</p>
                  </div>
                </div>
                <div className={`mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 dark:border-slate-800 dark:bg-slate-950 ${theme.heading}`}>
                  {selected.aiExplanation}
                </div>
                <div className="mt-4 space-y-2">
                  <div className={`text-xs font-bold uppercase ${theme.subText}`}>证据</div>
                  {selected.evidence.map(item => (
                    <div key={`${item.source}-${item.metric}`} className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800">
                      <div className={`font-semibold ${theme.heading}`}>{item.source.toUpperCase()} / {item.metric}</div>
                      <div className={`mt-1 break-words ${theme.subText}`}>{String(Array.isArray(item.value) ? item.value.join(" / ") : item.value)} · {item.interpretation}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  <div className={`text-xs font-bold uppercase ${theme.subText}`}>建议动作</div>
                  {selected.recommendedActions.map(action => (
                    <div key={action} className={`flex items-start gap-2 text-sm ${theme.heading}`}><IconDocumentText className="mt-0.5 size-4 text-blue-500" /> {action}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`text-sm ${theme.subText}`}>选择一个页面查看原因分析。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
