import {
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

export function generateWeChatState(): string {
  return randomBytes(32).toString("base64url");
}

export function digestWeChatState(state: string): string {
  return createHash("sha256").update(`wechat-state\0${state}`).digest("hex");
}

function hashWeChatSubject(input: {
  subjectType: "unionid" | "openid";
  appId: string;
  subject: string;
  identityPepper: string;
}): string {
  return createHmac("sha256", input.identityPepper)
    .update(
      input.subjectType === "unionid"
        ? `wechat-auth-subject\0provider=wechat\0type=unionid\0${input.subject}`
        : `wechat-auth-subject\0provider=wechat\0type=openid\0app_id=${input.appId}\0${input.subject}`,
    )
    .digest("hex");
}

export function hashWeChatIdentitySubjects(input: {
  appId: string;
  openId: string;
  unionId: string | null;
  identityPepper: string;
}): {
  primarySubjectHash: string;
  fallbackSubjectHash: string | null;
} {
  const openIdHash = hashWeChatSubject({
    subjectType: "openid",
    appId: input.appId,
    subject: input.openId,
    identityPepper: input.identityPepper,
  });
  if (!input.unionId) {
    return {
      primarySubjectHash: openIdHash,
      fallbackSubjectHash: null,
    };
  }
  return {
    primarySubjectHash: hashWeChatSubject({
      subjectType: "unionid",
      appId: input.appId,
      subject: input.unionId,
      identityPepper: input.identityPepper,
    }),
    fallbackSubjectHash: openIdHash,
  };
}
