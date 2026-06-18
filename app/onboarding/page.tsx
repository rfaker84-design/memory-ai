"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function OnboardingPage() {
  const r = useRouter();
  useEffect(() => { r.replace("/"); }, []);
  return null;
}