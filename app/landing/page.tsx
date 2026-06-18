"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function LandingPage() {
  const r = useRouter();
  useEffect(() => { r.replace("/"); }, []);
  return null;
}