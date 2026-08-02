"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import type { Memory } from "@/features/memory/types";
import { loadOwnedMemory, OwnedMemoryRequestError } from "@/src/components/memory/ownedMemoryClient";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; memory: Memory }
  | { status: "not-found" | "error" };

function confirmedFields(memory: Memory): Array<{ label: string; value: string }> {
  const candidates: Array<[string, string | null | undefined]> = [
    ["称呼", memory.name],
    ["关系", memory.relationship],
    ["人生概述", memory.lifeStory],
    ["表达风格", memory.speechStyle],
    ["常用语", memory.catchPhrases],
    ["价值与信念", memory.valuesBelief],
  ];
  return candidates.flatMap(([label, value]) => typeof value === "string" && value.trim()
    ? [{ label, value: value.trim() }]
    : []);
}

/** Owner-only view of the material currently allowed to ground a TA reply. */
export default function MemorySourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void loadOwnedMemory(id, controller.signal)
      .then((memory) => { if (!controller.signal.aborted) setState({ status: "ready", memory }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: error instanceof OwnedMemoryRequestError && error.status === 404 ? "not-found" : "error" });
      });
    return () => controller.abort();
  }, [id]);

  if (state.status !== "ready") {
    return <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
      <p>{state.status === "not-found" ? "找不到这段资料。" : state.status === "error" ? "资料暂时无法读取，请稍后重试。" : "正在读取已确认资料…"}</p>
      <Link href={`/memory-chat/${id}`}>返回相伴</Link>
    </main>;
  }

  const fields = confirmedFields(state.memory);
  return <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7 }}>
    <Link href={`/memory-chat/${id}`}>返回相伴</Link>
    <p style={{ marginTop: 28, color: "#8c6b48", fontSize: 13 }}>已确认资料来源</p>
    <h1 style={{ marginTop: 4 }}>{state.memory.name}</h1>
    <p>以下仅是你在建档时主动填写并确认、目前允许用于生成回复的资料。普通聊天不会自动加入，也不会被当作可引用记忆。</p>
    {fields.length ? <dl>
      {fields.map((field) => <div key={field.label} style={{ margin: "20px 0" }}>
        <dt style={{ fontWeight: 600 }}>{field.label}</dt>
        <dd style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{field.value}</dd>
      </div>)}
    </dl> : <p>当前没有可展示的已确认资料。忆见不会据此猜测或补全经历。</p>}
    <p style={{ marginTop: 28, fontSize: 14 }}>若资料需要补充、编辑或删除，请使用“拾忆”的明确确认流程；它不会从普通聊天自动写入。</p>
  </main>;
}
