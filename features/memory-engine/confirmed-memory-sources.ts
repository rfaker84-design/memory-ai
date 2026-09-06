import type { ConfirmedMemorySource } from "./types";

const SOURCE_TRAILER = /\s*\[\[MEMORYAI_SOURCES:([0-9a-fA-F-]+(?:,[0-9a-fA-F-]+)*)\]\]\s*$/;
const INTERNAL_SOURCE_MARKER = /\[{1,2}\s*MEMORYAI_SOURCES\b(?:(?!\]\])[\s\S])*(?:\]\]|$)/gi;

export interface ExtractedConfirmedMemorySources {
  content: string;
  sources: ConfirmedMemorySource[];
}

/**
 * Unknown, malformed, or repeated IDs are discarded. A provider response can
 * therefore never expose a source that was not Owner-bound and supplied for
 * this exact turn.
 */
export function extractConfirmedMemorySources(
  content: string,
  allowedSources: ConfirmedMemorySource[],
): ExtractedConfirmedMemorySources {
  const match = SOURCE_TRAILER.exec(content);
  const visibleContent = content.replace(INTERNAL_SOURCE_MARKER, "").trim();
  if (!match) return { content: visibleContent, sources: [] };

  const allowed = new Map(allowedSources.map((source) => [source.id.toLowerCase(), source]));
  const seen = new Set<string>();
  const sources: ConfirmedMemorySource[] = [];
  for (const id of match[1].split(",")) {
    const normalized = id.toLowerCase();
    const source = allowed.get(normalized);
    if (source && !seen.has(normalized)) {
      seen.add(normalized);
      sources.push(source);
    }
  }

  return { content: visibleContent, sources };
}
