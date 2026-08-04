/**
 * Historical dependency-scoring compatibility surface.
 *
 * Inferring vulnerability from chat, loss language, usage time, or return
 * behaviour is not an approved first-release feature.  This module preserves
 * its former API for build compatibility and deliberately performs no reads,
 * profiling, ranking, or outreach selection.
 */

import type { Emotion } from "./emotion";

export type DependencyLevel = "light" | "moderate" | "deep" | "intense";

export interface DependencyFactors {
  consecutiveLowMood: number;
  nightUsage: number;
  consecutiveChats: number;
  returnBehavior: number;
  lossMention: number;
  daysSinceLastChat: number;
}

export interface DependencyProfile {
  score: number;
  level: DependencyLevel;
  factors: DependencyFactors;
}

export interface DependencyStrategy {
  level: DependencyLevel;
  score: number;
  messageStyle: string;
  maxFrequency: string;
  exampleMessages: string[];
}

const ZERO_FACTORS: DependencyFactors = {
  consecutiveLowMood: 0,
  nightUsage: 0,
  consecutiveChats: 0,
  returnBehavior: 0,
  lossMention: 0,
  daysSinceLastChat: 0,
};

function noProfilingProfile(): DependencyProfile {
  return { score: 0, level: "light", factors: { ...ZERO_FACTORS } };
}

export async function calculateDependency(
  _userPhone: string,
  _recentEmotions: Emotion[],
  _messageTexts: string[],
  _lastChatAt: string | null,
  _currentHour?: number,
): Promise<DependencyProfile> {
  return noProfilingProfile();
}

export function getDependencyStrategy(profile: DependencyProfile): DependencyStrategy {
  return {
    level: profile.level,
    score: 0,
    messageStyle: "No proactive contact or engagement optimisation.",
    maxFrequency: "none",
    exampleMessages: [],
  };
}

export async function getUserDependencyProfile(_userPhone: string): Promise<DependencyProfile | null> {
  return null;
}
