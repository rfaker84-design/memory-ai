import { NextRequest, NextResponse } from "next/server";
import { PostgresUserReportService, REPORT_CONTENT_ACTIONS, type UserReport } from "@/features/reports";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";
import { hasValidInternalAccessToken } from "@/src/server/security/internal-access-token";

const TOKEN_HEADER = "x-report-review-access-token";
const ACCOUNT_HEADER = "x-report-reviewer-account";
const MINIMUM_TOKEN_BYTES = 48;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Service = Pick<PostgresUserReportService, "dispose">;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));
function authorized(request: NextRequest): string | null {
  const account = process.env.REPORT_REVIEW_ACCOUNT;
  const reviewer = request.headers.get(ACCOUNT_HEADER);
  return process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED === "true"
    && account
    && reviewer === account
    && hasValidInternalAccessToken({
      candidate: request.headers.get(TOKEN_HEADER),
      currentName: "REPORT_REVIEW_ACCESS_TOKEN",
      minimumBytes: MINIMUM_TOKEN_BYTES,
    })
    ? account
    : null;
}
export function validateReportReview(value: unknown): { input: { reportId:string; status:"triaged"|"actioned"|"closed"; disposition:string; contentAction: typeof REPORT_CONTENT_ACTIONS[number] } } | { error:string } {
  if(!value || typeof value!=="object" || Array.isArray(value)) return {error:"shape"}; const x=value as Record<string,unknown>, keys=Object.keys(x);
  if(keys.length!==4 || !keys.includes("reportId") || !keys.includes("status") || !keys.includes("disposition") || !keys.includes("contentAction")) return {error:"keys"};
  if(typeof x.reportId!=="string" || !UUID.test(x.reportId)) return {error:"id"};
  if(x.status!=="triaged" && x.status!=="actioned" && x.status!=="closed") return {error:"status"};
  if(typeof x.disposition!=="string") return {error:"disposition_type"}; const disposition=x.disposition.trim();
  if(typeof x.contentAction!=="string" || !REPORT_CONTENT_ACTIONS.includes(x.contentAction as typeof REPORT_CONTENT_ACTIONS[number])) return {error:"content_action"};
  return !disposition || disposition.length>1000 ? {error:"disposition_length"} : {input:{reportId:x.reportId,status:x.status,disposition,contentAction:x.contentAction as typeof REPORT_CONTENT_ACTIONS[number]}};
}
export function createReportReviewsHandler(service: Service = new PostgresUserReportService()) {
  return async function POST(request: NextRequest) {
    const reviewer=authorized(request); if(!reviewer) return json({error:"REPORT_REVIEW_UNAUTHORIZED"},{status:401});
    const validated=validateReportReview(await request.json().catch(()=>null)); if("error" in validated) return json({error:"INVALID_REPORT_REVIEW"},{status:400});
    try { const report=await service.dispose({...validated.input,reviewer}); return json({report}); } catch { return json({error:"REPORT_REVIEW_UNAVAILABLE"},{status:503}); }
  };
}
