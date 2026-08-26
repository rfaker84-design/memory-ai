"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type GuestCreateContinuation = {
  name: string;
  relationship: string;
};

type GuestCreateContinuationContextValue = {
  continuation: GuestCreateContinuation | null;
  continueGuestCreate: (value: GuestCreateContinuation) => void;
  clearGuestCreateContinuation: () => void;
};

const GuestCreateContinuationContext = createContext<GuestCreateContinuationContextValue | null>(null);

export function GuestCreateContinuationProvider({ children }: { children: ReactNode }) {
  const [continuation, setContinuation] = useState<GuestCreateContinuation | null>(null);
  const value = useMemo(() => ({
    continuation,
    continueGuestCreate: (next: GuestCreateContinuation) => setContinuation(next),
    clearGuestCreateContinuation: () => setContinuation(null),
  }), [continuation]);
  return <GuestCreateContinuationContext.Provider value={value}>{children}</GuestCreateContinuationContext.Provider>;
}

export function useGuestCreateContinuation() {
  const context = useContext(GuestCreateContinuationContext);
  if (!context) throw new Error("GuestCreateContinuationProvider is required");
  return context;
}

export const GUEST_CREATE_CONTINUATION_URL = "/create-memory";
