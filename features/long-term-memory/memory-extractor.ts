export interface ExtractInput {
  userId: string;
  memoryId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
}

export interface ExtractResult {
  shouldRemember: boolean;
  content?: string;
  importance: number;
  tags: string[];
}

const TRIGGER_KEYWORDS = [
  "记得",
  "喜欢",
  "讨厌",
  "以前",
  "小时候",
  "爸爸",
  "妈妈",
  "爷爷",
  "奶奶",
  "生日",
  "忌日",
  "家",
  "学校",
  "工作",
];

export class MemoryExtractor {
  extract(input: ExtractInput): ExtractResult {
    const combined =
      (input.userMessage ?? "") + " " + (input.assistantMessage ?? "");

    const matched = TRIGGER_KEYWORDS.filter((kw) => combined.includes(kw));

    if (matched.length === 0) {
      return {
        shouldRemember: false,
        importance: 0,
        tags: [],
      };
    }

    return {
      shouldRemember: true,
      content: "用户提到：" + input.userMessage,
      importance: 60,
      tags: ["chat"],
    };
  }
}
