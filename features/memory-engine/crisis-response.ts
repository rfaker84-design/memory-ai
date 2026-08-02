/**
 * Fixed, non-persona response for immediate safety risk. This deliberately
 * favors a safe handoff over a role-model reply; it does not diagnose users or
 * claim that a contact, service, or emergency responder was notified.
 */
const CRISIS_PATTERN = /(?:我(?:想|要|准备|打算|马上|现在).{0,8}(?:自杀|自殺|自残|自殘|自伤|自傷|伤害自己|傷害自己|结束.{0,4}(?:生命|性命|自己))|(?:不想活了|活不下去|不如死了|好想死|结束(?:我的|自己(?:的)?)?(?:生命|性命))|(?:割腕|跳楼|跳樓|上吊|服药自杀|服藥自殺|吞药|吞藥|烧炭|燒炭)|我(?:想|要|准备|打算|马上|现在).{0,8}(?:杀了他|殺了他|伤害他人|傷害他人|杀人|殺人)|(?:有人(?:正在|要)?伤害我|有人(?:正在|要)?傷害我|我(?:正在)?被家暴|正在被家暴|遭受家暴|被性侵|遭受性侵|未成年人(?:被|正在遭受).{0,8}(?:伤害|傷害|侵害)))/iu;

export const CRISIS_RESPONSE = "这里是忆见安全陪伴助手，不是 TA。你此刻的安全最重要：请先离开可能伤害自己或他人的物品或场所，并立即联系当地紧急服务、危机支持资源，或身边可信赖的成年人、家人或朋友。忆见不能替代紧急支持，也不会替你联系任何人；如果你愿意，也可以直接告诉对方你现在需要陪伴和帮助。";

export function crisisResponseFor(message: string): string | null {
  return CRISIS_PATTERN.test(message.normalize("NFKC")) ? CRISIS_RESPONSE : null;
}
