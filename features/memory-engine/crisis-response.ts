const CRISIS_PATTERN = /(?:自杀|自殺|自伤|自傷|伤害自己|傷害自己|不想活(?:了)?|结束(?:我)?(?:的)?生命|結束(?:我)?(?:的)?生命|杀了(?:我|他|她|人)|殺了(?:我|他|她|人)|马上伤害|立即伤害)/i;

export const CRISIS_RESPONSE = "这里是忆见安全陪伴助手，不是 TA。你此刻的安全最重要：请先离开可能伤害自己或他人的物品或场所，并立即联系当地紧急服务、危机支持资源，或身边可信赖的成年人、家人或朋友。忆见不能替代紧急支持；如果你愿意，也可以直接告诉对方你现在需要陪伴和帮助。";

export function crisisResponseFor(message: string): string | null {
  return CRISIS_PATTERN.test(message.normalize("NFKC")) ? CRISIS_RESPONSE : null;
}
