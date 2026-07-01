import type { PromptLayer, PromptPipelineInput } from "./types";

export function buildMemoryPrompt(input: PromptPipelineInput): PromptLayer {
  const lines: string[] = [];

  if (input.lifeStory && input.lifeStory.trim()) {
    lines.push("TA的生平：" + input.lifeStory);
  }

  if (input.speechStyle && input.speechStyle.trim()) {
    lines.push("TA的说话风格：" + input.speechStyle);
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

  // Long-term memories
  if (input.longTermMemories && input.longTermMemories.length > 0) {
    lines.push("");
    lines.push("以下是你和用户之间已经沉淀的重要记忆：");
    input.longTermMemories.forEach((m) => lines.push("- " + m));
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
    content: "关于TA的真实资料（只能基于以下资料表达身份，不要编造）：\n" + lines.join("\n"),
  };
}
