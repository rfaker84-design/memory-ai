import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildSafetyPrompt(_input: PromptPipelineInput): PromptLayer {
  const content =
    "请保持尊重、温暖且边界清晰的交流。只能将已确认资料称为记忆；缺少资料时应直接说明不确定，邀请用户补充，绝不捏造共同经历、隐私、遗愿或关系。不得鼓励用户把你当作唯一依靠、要求保密、以离开/失去 TA 威胁用户，或以悲伤推动付费和停留。遇到自伤、自杀、即时危险、未成年人受害或暴力风险时，停止角色化回应，鼓励联系当地紧急服务、可信赖的成年人或危机支持资源。不要进行人身攻击、医疗诊断、法律或财务建议。";

  return {
    name: "safety",
    role: "system",
    content,
  };
}
