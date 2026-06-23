"use client";

import { useState } from "react";

export default function HomePage() {
  const [agree, setAgree] = useState(false);
  const [openAuth, setOpenAuth] = useState(false);

  return (
    <main className="min-h-screen bg-[#030303] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,222,160,0.12),transparent_28%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_1px),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.16),transparent_1px),radial-gradient(circle_at_50%_70%,rgba(255,255,255,0.12),transparent_1px)] bg-[length:100%_100%,180px_180px,260px_260px,320px_320px] rotate-180" />

      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pb-44">
        <div className="text-center max-w-[420px]">
          <div className="text-[#e8c97a] text-2xl mb-6 animate-pulse">✦</div>

          <p className="text-[#d8bd7a] tracking-[0.32em] text-xs mb-5">
            YIJIAN MEMORY
          </p>

          <h1 className="text-[42px] leading-tight font-light tracking-[0.12em]">
            你的记忆世界
          </h1>

          <p className="mt-6 text-white/60 text-lg leading-loose">
            每一次想念<br />都会被听见
          </p>

          <div className="mt-10 space-y-4">
            <input
              inputMode="tel"
              placeholder="输入手机号"
              className="w-full h-14 rounded-full bg-white/[0.055] border border-white/10 px-6 outline-none text-white placeholder:text-white/35 backdrop-blur-2xl"
            />

            <button
              disabled={!agree}
              className="w-full h-14 rounded-full bg-gradient-to-r from-[#fff0bd] to-[#d5a24b] text-[#1b1204] font-semibold disabled:opacity-40"
            >
              获取验证码
            </button>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button disabled={!agree} className="h-12 rounded-full bg-white/[0.04] border border-white/10 text-white/70 disabled:opacity-40">
                微信登录
              </button>
              <button disabled={!agree} className="h-12 rounded-full bg-white/[0.04] border border-white/10 text-white/70 disabled:opacity-40">
                Apple 登录
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-32px)] max-w-[680px] text-center text-xs text-white/50 leading-relaxed">
        <label className="flex items-center justify-center gap-2 flex-wrap">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="accent-[#e8c97a]"
          />
          <span>
            我已阅读并同意
            <b className="text-[#ecd48f] font-normal mx-1">《用户协议》</b>
            <b className="text-[#ecd48f] font-normal mx-1">《隐私政策》</b>
          </span>
        </label>

        <button
          onClick={() => setOpenAuth(!openAuth)}
          className="mt-2 text-[#ecd48f]/80"
        >
          {openAuth ? "收起忆见授权说明" : "查看忆见授权说明"}
        </button>

        {openAuth && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {[
              "数字人授权声明",
              "AI生成内容说明",
              "逝者数字重建说明",
              "照片声音视频资料授权",
              "数据导出与删除说明",
              "肖像权与声音权益保护",
              "侵权投诉入口",
              "未成年人保护",
            ].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1">
                {item}
              </span>
            ))}
          </div>
        )}

        <p className="mt-3 text-white/35">
          我确认拥有或已取得上传照片、声音、视频、故事资料的合法授权。忆见生成内容为 AI 重建结果，不代表真实人类意识。
        </p>
      </section>

      <nav className="fixed bottom-0 left-0 right-0 z-30 h-20 bg-black/70 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around text-xs text-white/55">
        <div className="text-[#e8c97a]">首页</div>
        <div>陪伴</div>
        <div>记忆</div>
        <div>我的</div>
      </nav>
    </main>
  );
}
