"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

type ToastItem = { id: string; message: string; visible: boolean; resolve?: (ok: boolean) => void };

const ToastCtx = createContext<{
  toast: (msg: string) => void;
  confirm: (msg: string) => Promise<boolean>;
}>({
  toast: () => {},
  confirm: async () => false,
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string) => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev, { id, message, visible: true }]);
    setTimeout(() => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, visible: false } : i));
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 300);
    }, 2600);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      const id = Math.random().toString(36).slice(2);
      setItems(prev => [...prev, { id, message, visible: true, resolve }]);
    });
  }, []);

  const answer = (id: string, ok: boolean) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, visible: false } : i));
    const item = items.find(i => i.id === id);
    item?.resolve?.(ok);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 300);
  };

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}
      {items.map(item => (
        <div
          key={item.id}
          style={{
            position: "fixed",
            bottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: "90vw",
            opacity: item.visible ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: 16,
              padding: "14px 24px",
              color: "#3D3226",
              fontSize: 14,
              fontWeight: 400,
              letterSpacing: "0.03em",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              border: "1px solid rgba(214,191,163,0.15)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span>{item.message}</span>
            {item.resolve && (
              <div style={{ display: "flex", gap: 8, marginLeft: 4 }}>
                <button
                  onClick={() => answer(item.id, true)}
                  style={{
                    background: "#C4A882",
                    color: "#fff",
                    border: "none",
                    borderRadius: 999,
                    padding: "4px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: 400,
                  }}
                >
                  确定
                </button>
                <button
                  onClick={() => answer(item.id, false)}
                  style={{
                    background: "rgba(0,0,0,0.06)",
                    color: "#7A6E62",
                    border: "none",
                    borderRadius: 999,
                    padding: "4px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: 400,
                  }}
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </ToastCtx.Provider>
  );
}