"use client";

import { useEffect, useState } from "react";
import Link from "next/link"; import { useToast } from "../../../components/toast";

interface CompanionSettings {
  user_phone: string;
  proactive_enabled: boolean;
  proactive_daily_max: number;
  emotion_trigger_enabled: boolean;
  night_mode_enabled: boolean;
  inactivity_trigger_enabled: boolean;
}

interface PlanInfo {
  plan: string;
  daily_max: number;
}

const PLAN_LABELS: Record<string, string> = {
  free: "免费版",
  pro: "专业版",
  premium: "高级版",
};

const PLAN_DESCS: Record<string, string> = {
  free: "每周最多3条主动消息",
  pro: "每天最多1条主动消息",
  premium: "每天最多3条主动消息",
};

export default function CompanionSettingsPage() {
  const { toast } = useToast(); const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanionSettings>({
    user_phone: "",
    proactive_enabled: true,
    proactive_daily_max: 0,
    emotion_trigger_enabled: true,
    night_mode_enabled: true,
    inactivity_trigger_enabled: true,
  });
  const [planInfo, setPlanInfo] = useState<PlanInfo>({ plan: "free", daily_max: 3 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const phone = localStorage.getItem("yijian_phone");
    if (!phone) { window.location.href = "/login"; return; }
    loadSettings(phone);
  }, []);

  const loadSettings = async (phone: string) => {
    try {
      const res = await fetch(`/api/settings/companion?user_phone=${phone}`);
      const data = await res.json();
      if (data.settings) {
        setSettings({ ...data.settings, user_phone: phone });
        setPlanInfo({ plan: data.settings.user_plan || "free", daily_max: data.daily_max });
      }
    } catch {
      // 使用默认值
      setSettings((s) => ({ ...s, user_phone: phone }));
    }
    setLoading(false);
  };

  const handleToggle = (field: keyof CompanionSettings) => {
    setSettings((prev) => ({ ...prev, [field]: !prev[field] }));
    setSaved(false);
  };

  const handleSlider = (value: number) => {
    setSettings((prev) => ({ ...prev, proactive_daily_max: value }));
    setSaved(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/companion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast("保存失败，请重试");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-12 w-12 rounded-full bg-primary-soft animate-breathe" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-5 py-10 pb-20">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <header className="mb-8 animate-fade-in-up">
          <Link href="/" className="text-[13px] text-text-muted hover:text-text-soft transition-colors">&larr; 返回首页</Link>
          <h1 className="mt-4 font-serif text-[28px] font-light text-text">陪伴设置</h1>
          <p className="mt-2 text-[15px] text-text-muted">让 AI 用你喜欢的方式陪伴你</p>
        </header>

        {/* Plan badge */}
        <div className="mb-8 animate-fade-in-up rounded-2xl bg-surface p-5 shadow-card" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[13px] font-medium text-primary">
                {PLAN_LABELS[planInfo.plan] || "免费版"}
              </span>
              <p className="mt-2 text-[13px] text-text-muted">{PLAN_DESCS[planInfo.plan] || ""}</p>
            </div>
            <span className="font-serif text-2xl text-primary">{planInfo.daily_max}</span>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-1 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
          {/* Master toggle */}
          <SettingRow
            label="允许 AI 主动聊天"
            desc="关闭后，数字人格仅在用户主动聊天时回复"
            enabled={settings.proactive_enabled}
            onToggle={() => handleToggle("proactive_enabled")}
          />

          {settings.proactive_enabled && (
            <>
              <div className="my-4 rounded-2xl bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium text-text">每日最大主动次数</p>
                    <p className="text-[12px] text-text-muted">0 = 使用计划默认值（{planInfo.daily_max}条）</p>
                  </div>
                  <span className="font-serif text-xl text-primary">{settings.proactive_daily_max || planInfo.daily_max}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(planInfo.daily_max * 2, 6)}
                  value={settings.proactive_daily_max}
                  onChange={(e) => handleSlider(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full bg-ink-faint/15 appearance-none cursor-pointer accent-gold"
                />
                <div className="flex justify-between text-[11px] text-text-muted mt-1">
                  <span>0</span>
                  <span>{Math.max(planInfo.daily_max * 2, 6)}</span>
                </div>
              </div>

              <SettingRow
                label="情绪触发"
                desc="当检测到情绪低落时，AI 主动关心"
                enabled={settings.emotion_trigger_enabled}
                onToggle={() => handleToggle("emotion_trigger_enabled")}
              />
              <SettingRow
                label="夜间陪伴模式"
                desc="深夜时段 (22:00-2:00) 主动发晚安"
                enabled={settings.night_mode_enabled}
                onToggle={() => handleToggle("night_mode_enabled")}
              />
              <SettingRow
                label="不活跃提醒"
                desc="超过 24 小时未聊天时主动问候"
                enabled={settings.inactivity_trigger_enabled}
                onToggle={() => handleToggle("inactivity_trigger_enabled")}
              />
            </>
          )}
        </div>

        {/* Save */}
        <div className="mt-10 animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full rounded-2xl bg-primary py-4 text-[15px] font-medium text-white shadow-button transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "保存中..." : saved ? "✓ 已保存" : "保存设置"}
          </button>
        </div>

        {/* AI 解释能力说明 */}
        <div className="mt-10 animate-fade-in-up rounded-2xl bg-rose/10 p-5" style={{ animationDelay: "400ms" }}>
          <h3 className="font-serif text-lg text-text">透明性说明</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-text-soft">
            当 AI 主动给你发消息时，你可以看到触发原因和依据（如最近聊过的话题、检测到的情绪）。
            你始终可以控制这些行为。
          </p>
        </div>
      </div>
    </main>
  );
}

function SettingRow({
  label,
  desc,
  enabled,
  onToggle,
}: {
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface px-5 py-4 shadow-card">
      <div className="flex-1 mr-4">
        <p className="font-medium text-text">{label}</p>
        <p className="mt-0.5 text-[12px] text-text-muted">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
          enabled ? "bg-primary" : "bg-ink-faint/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-200 ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
