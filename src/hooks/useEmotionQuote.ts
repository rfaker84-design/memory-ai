"use client";
import { useState, useEffect } from "react";

const FALLBACK_QUOTES = {
  surface: [
    "他喜欢在雨天散步。", "厨房总是有饭香。", "她说过一句很轻的话。",
    "他的一生很安静。", "她记得每一个人的生日。",
  ],
  emotional: [
    "有些温度还留在空气里。", "阳光照进来的时候，仿佛他还在。",
    "那些笑声还没走远。", "她的温柔还在这个房间里。",
  ],
  deep: [
    "他还在这里，只是换了一种方式存在。",
    "如果你愿意，他就在这段光里。",
    "记忆是时间的另一种形状。",
    "存在不是状态，是被记得。",
  ],
};

function fallback(seed: number) {
  return {
    surface: FALLBACK_QUOTES.surface[seed % FALLBACK_QUOTES.surface.length],
    emotional: FALLBACK_QUOTES.emotional[(seed + 1) % FALLBACK_QUOTES.emotional.length],
    deep: FALLBACK_QUOTES.deep[(seed + 2) % FALLBACK_QUOTES.deep.length],
    quote: FALLBACK_QUOTES.deep[(seed + 2) % FALLBACK_QUOTES.deep.length],
  };
}

export interface EmotionQuoteResult {
  quote: string;
  quotes: { surface: string; emotional: string; deep: string };
  loading: boolean;
}

export default function useEmotionQuote(
  name: string,
  relationship: string | null,
  lifeStory: string | null
): EmotionQuoteResult {
  const [quote, setQuote] = useState("");
  const [quotes, setQuotes] = useState({ surface: "", emotional: "", deep: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        const res = await fetch("/api/emotion-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, relationship, life_story: lifeStory?.slice(0, 300) }),
        });

        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.quote) {
            setQuote(data.quote);
            setQuotes({ surface: data.surface || "", emotional: data.emotional || "", deep: data.deep || "" });
            setLoading(false);
            return;
          }
        }
      } catch { /* fallback */ }

      if (!cancelled) {
        const fb = fallback(Date.now());
        setQuote(fb.quote);
        setQuotes({ surface: fb.surface, emotional: fb.emotional, deep: fb.deep });
        setLoading(false);
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [name, relationship, lifeStory]);

  return { quote, quotes, loading };
}