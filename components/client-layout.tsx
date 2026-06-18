"use client";

import { ToastProvider } from "./toast";
import type { ReactNode } from "react";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}