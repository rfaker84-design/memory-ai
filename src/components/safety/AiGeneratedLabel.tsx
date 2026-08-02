export function AiGeneratedLabel({ compact = false, confirmedSources = false }: { compact?: boolean; confirmedSources?: boolean }) {
  const label = confirmedSources
    ? "AI生成 · 基于已确认资料"
    : "AI 生成内容 · 不代表真实人物或其真实表达";
  return <span role="note" aria-label="AI generated content disclosure" style={{ display: "inline-block", padding: compact ? "2px 6px" : "4px 8px", borderRadius: 999, border: "1px solid currentColor", fontSize: compact ? 11 : 12, lineHeight: 1.3 }}>{label}</span>;
}
