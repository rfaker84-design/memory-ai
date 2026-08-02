import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildMemoryPrompt(input: PromptPipelineInput): PromptLayer {
  const lines: string[] = [];

  if (input.lifeStory && input.lifeStory.trim()) {
    lines.push("TA的生平：" + input.lifeStory);
  }

  if (input.speechStyle && input.speechStyle.trim()) {
    lines.push("TA的说话风格：" + input.speechStyle);
  }

  if (input.personalityProfile && input.personalityProfile.trim()) {
    lines.push("TA的人格档案：" + input.personalityProfile);
  }

  if (input.catchPhrases && input.catchPhrases.trim()) {
    lines.push("TA常说的话：" + input.catchPhrases);
  }

  if (input.birthYear != null) {
    const birth = "出生年份：" + input.birthYear;
    if (input.deathYear != null) {
      lines.push(birth + "，离世年份：" + input.deathYear);
    } else {
      lines.push(birth);
    }
  }

  if (input.valuesBelief && input.valuesBelief.trim()) {
    lines.push("TA的价值观：" + input.valuesBelief);
  }

  if (input.personalityType && input.personalityType.trim()) {
    lines.push("TA的性格类型：" + input.personalityType);
  }

  if (input.fragments.length > 0) {
    lines.push("TA的记忆碎片：");
    input.fragments.forEach((f) => lines.push("- " + f));
  }

  if (input.timeline.length > 0) {
    lines.push("");
    lines.push("TA的时间线：");
    input.timeline.forEach((t) => lines.push("- " + t));
  }

  if (lines.length === 0) {
    return {
      name: "memory",
      role: "system",
      content: "暂无额外记忆信息。",
    };
  }

  return {
    name: "memory",
    role: "system",
    content:
      "关于TA的已确认资料（只能基于以下资料表达身份，不要编造）：\n"
      + lines.join("\n")
      + "\n称呼、常用语、说话风格和共同回忆属于用户已确认的参考资料；在相关回复中可谨慎引用，但不得把它们外推为新事实，也不得以通用模板替代这些表达。",
  };
}
