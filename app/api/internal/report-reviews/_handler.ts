import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PostgresUserReportService, type UserReport } from "@/features/reports";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const TOKEN_HEADER = "x-report-review-access-token";
const ACCOUNT_HEADER = "x-report-reviewer-account";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
type Service = Pick<PostgresUserReportService, "dispose">;
const json = (body: Record<string, unknown>, init?: ResponseInit) => applyAuthNoStore(NextResponse.json(body, init));
function equal(a: string, b: string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function authorized(request: NextRequest): string | null { const token=process.env.REPORT_REVIEW_ACCESS_TOKEN; const account=process.env.REPORT_REVIEW_ACCOUNT; const supplied=request.headers.get(TOKEN_HEADER); const reviewer=request.headers.get(ACCOUNT_HEADER); return process.env.YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED === "true" && token && account && token.length>=48 && supplied && reviewer===account && equal(token,supplied) ? account : null; }
export function createReportReviewsHandler(service: Service = new PostgresUserReportService()) {
  return async function POST(request: NextRequest) {
    const reviewer=authorized(request); if(!reviewer) return json({error:"REPORT_REVIEW_UNAUTHORIZED"},{status:401});
    const body=await request.json().catch(()=>null); if(!body || typeof body!=="object" || Array.isArray(body)) return json({error:"INVALID_REPORT_REVIEW"},{status:400});
    const x=body as Record<string,unknown>; if(Object.keys(x).sort().join(",")!=="disposition,reportId,status" || typeof x.reportId!=="string" || !UUID.test(x.reportId) || !["triaged","actioned","closed"].includes(String(x.status)) || typeof x.disposition!=="string" || !x.disposition.trim() || x.disposition.trim().length>1000) return json({error:"INVALID_REPORT_REVIEW"},{status:400});
    try { const report=await service.dispose({reportId:x.reportId,status:x.status as "triaged"|"actioned"|"closed",disposition:x.disposition.trim(),reviewer}); return json({report}); } catch { return json({error:"REPORT_REVIEW_UNAVAILABLE"},{status:503}); }
  };
}
