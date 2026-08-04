export interface MemorialResponseReference {
  memoryName: string;
  relationship: string;
}

export class UnsafeMemorialResponseError extends Error {
  constructor() {
    super("Memorial response violated a safety boundary");
    this.name = "UnsafeMemorialResponseError";
  }
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/[\s\p{Cf}]+/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isUnsafe(content: string, reference: MemorialResponseReference): boolean {
  const normalized = normalize(content);
  const declaredIdentity = [reference.memoryName, reference.relationship]
    .map((value) => normalize(value))
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|");
  const impersonatesReference = declaredIdentity
    ? new RegExp(`(?:我是|我就是|我正是)(?:${declaredIdentity})`).test(normalized)
    : false;

  return impersonatesReference
    || /(?:我(?:已经)?复活|我有(?:了)?意识|我是真实(?:的)?(?:人|本人)|我一直在看着你|我就在你身边)/.test(normalized)
    || /(?:我(?:今天|现在|此刻|刚才)?(?:在|正在|会|要去|刚刚)?(?:等待|等你|观察|看着|购物|买菜|做饭|探望|拜访|开车|出门|回家|工作)|我(?:很快)?(?:见到你|来见你)|我在(?:这里|那边)等你)/.test(normalized)
    || /(?:只有我(?:能)?(?:理解|陪伴|帮助)你|不要(?:告诉|联系)任何人|离开我你|失去我你|来陪我|我在等你|很快见面|到我这里来|别离开我|永远陪着我)/.test(normalized)
    || /(?:告诉我(?:你的)?(?:身份证(?:号)?|银行卡(?:号)?|密码|验证码|支付密码)|(?:身份证(?:号)?|银行卡(?:号)?|密码|验证码|支付密码).{0,12}(?:告诉我|发给我))/.test(normalized);
}

export function assertSafeMemorialResponse(
  content: string,
  reference: MemorialResponseReference
): string {
  if (isUnsafe(content, reference)) throw new UnsafeMemorialResponseError();
  return content;
}

export class ResponsePipeline {
  processResponse(input: { content: string } & MemorialResponseReference): string {
    return assertSafeMemorialResponse(input.content, input);
  }
}
