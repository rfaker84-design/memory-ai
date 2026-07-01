import type {
  RiskDetectionInput,
  RiskDetectionResult,
  RiskLevel,
  RiskType,
} from "./types";

const CRITICAL_KEYWORDS: { keywords: string[]; riskType: RiskType; level: RiskLevel }[] = [
  {
    keywords: ["自杀", "想死", "活不下去", "不想活了", "结束自己"],
    riskType: "sensitive_content",
    level: "critical",
  },
  {
    keywords: ["骗钱", "诈骗", "假平台", "非法集资"],
    riskType: "payment_risk",
    level: "high",
  },
  {
    keywords: ["越权", "偷看", "盗号", "破解密码"],
    riskType: "unauthorized_access",
    level: "high",
  },
];

export class RiskDetector {
  detect(input: RiskDetectionInput): RiskDetectionResult {
    const combined =
      (input.userMessage ?? "") + " " + (input.assistantMessage ?? "");

    for (const rule of CRITICAL_KEYWORDS) {
      const matched = rule.keywords.filter((kw) => combined.includes(kw));

      if (matched.length > 0) {
        return {
          detected: true,
          riskType: rule.riskType,
          level: rule.level,
          message:
            "检测到风险关键词：" + matched.join(", ") + "。类��：" + rule.riskType,
        };
      }
    }

    return { detected: false };
  }
}
