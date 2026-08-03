"use client";

import { AccountProfilePanel } from "@/src/components/trust/AccountProfilePanel";
import { MotionProvider } from "@/src/motion";

export default function AccountProfilePage() {
  return <MotionProvider><AccountProfilePanel /></MotionProvider>;
}
