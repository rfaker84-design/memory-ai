"use client";
import { useState, useCallback } from "react";

interface FieldState {
  activeId: string | null;
  dimmedIds: Set<string>;
  globalBrightness: number;  // 0-1
}

export default function useFieldCoupling() {
  const [field, setField] = useState<FieldState>({
    activeId: null, dimmedIds: new Set(), globalBrightness: 0.5,
  });

  const activate = useCallback((id: string) => {
    setField(prev => {
      const dimmed = new Set<string>();
      if (prev.activeId) dimmed.add(prev.activeId);
      dimmed.add(id); // will be excluded from dimming below
      return {
        activeId: id, dimmedIds: dimmed,
        globalBrightness: Math.min(1, prev.globalBrightness + 0.05),
      };
    });
  }, []);

  const deactivate = useCallback(() => {
    setField(prev => ({
      activeId: null, dimmedIds: new Set(),
      globalBrightness: Math.max(0.3, prev.globalBrightness - 0.03),
    }));
  }, []);

  const isActive = useCallback((id: string) => field.activeId === id, [field.activeId]);
  const isDimmed = useCallback((id: string) =>
    field.activeId !== null && field.activeId !== id, [field.activeId]);

  return { field, activate, deactivate, isActive, isDimmed };
}