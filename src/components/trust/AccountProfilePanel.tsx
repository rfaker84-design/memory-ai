"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { MemoryButton, MemoryInput } from "../memory-ui";
import {
  AccountProfileRequestError,
  readAdultProfile,
  saveAdultBirthDate,
} from "./accountProfileClient";

export function AccountProfilePanel() {
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState("正在读取账户资料…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void readAdultProfile().then((profile) => {
      setBirthDate(profile.birthDate ?? "");
      setStatus(profile.adultEligible ? "已完成成年确认。你可以随时更正生日。" : "请填写生日以完成成年确认。");
    }).catch(() => setStatus("暂时无法读取账户资料。你的资料没有被修改。"));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus("");
    try {
      const profile = await saveAdultBirthDate(birthDate);
      setStatus(profile.adultEligible
        ? "生日已保存。年龄判断会按当前日期重新计算。"
        : "生日已保存；忆见首发仅向年满 18 周岁的用户提供服务。");
    } catch (error) {
      setStatus(error instanceof AccountProfileRequestError && error.code === "ADULT_ELIGIBILITY_REQUIRED"
        ? "忆见首发仅向年满 18 周岁的用户提供服务。"
        : "生日尚未保存，请检查日期后明确重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ width: "min(42rem, 100%)", margin: "0 auto", padding: "max(2rem, 8vh) 1.25rem" }}>
      <p>账户资料</p>
      <h1>成年确认</h1>
      <p>忆见首发仅面向年满 18 周岁的用户。生日只用于当前年龄判断，你可以随时更正。</p>
      <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
        <MemoryInput label="出生日期" type="date" value={birthDate} onChange={(event: ChangeEvent<HTMLInputElement>) => setBirthDate(event.currentTarget.value)} required />
        {status && <p role="status">{status}</p>}
        <MemoryButton type="submit" loading={saving} disabled={!birthDate}>保存生日</MemoryButton>
      </form>
    </main>
  );
}
