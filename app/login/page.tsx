"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const r = useRouter();
  useEffect(() => { r.replace("/"); }, []);
  return null;
}