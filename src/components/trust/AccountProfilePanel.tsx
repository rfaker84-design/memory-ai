"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { MemoryButton, MemoryInput } from "../memory-ui";
import {
  AccountProfileRequestError,
  readAdultProfile,
  saveAdultBirthDate,
} from "./accountProfileClient";

export function AccountProfilePanel() {
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState("正在读取账户资料…");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unauthenticated" | "unavailable">("loading");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setStatus("正在读取账户资料…");
    try {
      const profile = await readAdultProfile(fetch, undefined, signal);
      if (signal?.aborted) return;
      setBirthDate(profile.birthDate ?? "");
      setStatus(profile.adultEligible ? "已完成成年确认。你可以随时更正生日。" : "请填写生日以完成成年确认。");
      setLoadState("ready");
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof AccountProfileRequestError && error.code === "UNAUTHENTICATED") {
        setStatus("登录状态已失效。请重新登录后查看或更正生日。");
        setLoadState("unauthenticated");
      } else {
        setStatus("暂时无法读取账户资料。你的资料没有被修改。");
        setLoadState("unavailable");
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || loadState !== "ready") return;
    setSaving(true);
    setStatus("");
    try {
      const profile = await saveAdultBirthDate(birthDate);
      setStatus(profile.adultEligible
        ? "生日已保存。年龄判断会按当前日期重新计算。"
        : "生日已保存；忆见首发仅向年满 18 周岁的用户提供服务。");
    } catch (error) {
      if (error instanceof AccountProfileRequestError && error.code === "UNAUTHENTICATED") {
        setStatus("登录状态已失效。请重新登录后再保存生日。");
        setLoadState("unauthenticated");
      } else {
        setStatus(error instanceof AccountProfileRequestError && error.code === "ADULT_ELIGIBILITY_REQUIRED"
          ? "忆见首发仅向年满 18 周岁的用户提供服务。"
          : "生日尚未保存，请检查日期后明确重试。");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ width: "min(42rem, 100%)", margin: "0 auto", padding: "max(2rem, 8vh) 1.25rem" }}>
      <p>账户资料</p>
      <h1>成年确认</h1>
      <p>忆见首发仅面向年满 18 周岁的用户。生日只用于当前年龄判断，你可以随时更正。</p>
      {loadState === "loading" && <p role="status">{status}</p>}
      {loadState === "unauthenticated" && <p role="alert">{status} <Link href="/login">前往登录</Link></p>}
      {loadState === "unavailable" && <><p role="alert">{status}</p><button type="button" onClick={() => void load()}>重新读取</button></>}
      {loadState === "ready" &&
      <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
        <MemoryInput label="出生日期" type="date" value={birthDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setBirthDate(event.currentTarget.value)} required />
        {status && <p role="status">{status}</p>}
        <MemoryButton type="submit" loading={saving} disabled={!birthDate}>保存生日</MemoryButton>
      </form>
      }
    </main>
  );
}
