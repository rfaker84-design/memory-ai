"use client";

import { CreateMemoryExperience } from "../../src/components/create-memory/CreateMemoryExperience";
import { MotionProvider } from "../../src/motion";

export default function CreateMemoryPage() {
  return <MotionProvider><CreateMemoryExperience /></MotionProvider>;
}
