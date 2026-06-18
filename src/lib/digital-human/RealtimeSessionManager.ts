// RealtimeSessionManager.ts — V3 Real-Time Digital Human Pipeline
//
// Orchestrates: User Input → Streaming LLM → Streaming TTS → Avatar
// Manages: emotion state, streaming text buffer, audio queue, avatar sync

export type PipelinePhase = "idle" | "listening" | "thinking" | "speaking" | "responding";

export interface SessionState {
  phase: PipelinePhase;
  emotion: string;
  partialText: string;           // streaming text so far
  fullText: string;              // complete response
  audioChunks: number;           // number of audio chunks received
  totalAudioChunks: number;      // estimated total chunks
  latencyMs: number;             // time from user input to first token
  tokenCount: number;            // tokens received so far
  avatarReady: boolean;
  streaming: boolean;
}

export interface SessionConfig {
  memoryId: string;
  name: string;
  relationship: string | null;
  lifeStory: string | null;
  emotion: string;
}

// ─── Audio chunk queue for sequential playback ──────────────
export class AudioChunkQueue {
  private chunks: Array<{ base64: string; index: number }> = [];
  private nextIndex = 0;
  private currentAudio: HTMLAudioElement | null = null;
  private onPlayCallback: ((playing: boolean) => void) | null = null;
  private onChunkPlayed: ((index: number) => void) | null = null;

  addChunk(base64: string, index: number): void {
    this.chunks.push({ base64, index });
    this.chunks.sort((a, b) => a.index - b.index);
    this.tryPlayNext();
  }

  setOnPlay(cb: (playing: boolean) => void): void { this.onPlayCallback = cb; }
  setOnChunkPlayed(cb: (index: number) => void): void { this.onChunkPlayed = cb; }

  private tryPlayNext(): void {
    if (this.currentAudio) return; // already playing

    const chunk = this.chunks.find(c => c.index === this.nextIndex);
    if (!chunk) return;

    this.chunks = this.chunks.filter(c => c.index !== this.nextIndex);
    this.nextIndex++;

    const audio = new Audio("data:audio/mp3;base64," + chunk.base64);
    this.currentAudio = audio;
    this.onPlayCallback?.(true);
    this.onChunkPlayed?.(chunk.index);

    audio.onended = () => {
      this.currentAudio = null;
      this.onChunkPlayed?.(-1);
      this.tryPlayNext();
      if (this.chunks.length === 0 && !this.currentAudio) {
        this.onPlayCallback?.(false);
      }
    };

    audio.onerror = () => {
      this.currentAudio = null;
      this.tryPlayNext();
    };

    audio.play().catch(() => {
      this.currentAudio = null;
      this.tryPlayNext();
    });
  }

  clear(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.chunks = [];
    this.nextIndex = 0;
    this.onPlayCallback?.(false);
  }

  get isPlaying(): boolean { return this.currentAudio !== null || this.chunks.length > 0; }
}

// ─── Session Manager ────────────────────────────────────────
export class RealtimeSessionManager {
  config: SessionConfig;
  state: SessionState;
  audioQueue: AudioChunkQueue;
  private startTime: number = 0;
  private abortController: AbortController | null = null;
  private onStateChange: ((state: SessionState) => void) | null = null;

  constructor(config: SessionConfig) {
    this.config = config;
    this.audioQueue = new AudioChunkQueue();
    this.state = {
      phase: "idle", emotion: config.emotion,
      partialText: "", fullText: "", audioChunks: 0,
      totalAudioChunks: 0, latencyMs: 0, tokenCount: 0,
      avatarReady: false, streaming: false,
    };

    this.audioQueue.setOnPlay((playing) => {
      if (playing) {
        this.updateState({ phase: "speaking" });
      } else if (this.state.phase === "speaking") {
        this.updateState({ phase: "responding" });
      }
    });
  }

  setOnStateChange(cb: (state: SessionState) => void): void { this.onStateChange = cb; }

  private updateState(partial: Partial<SessionState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.state);
  }

  // ─── Start streaming pipeline ─────────────────────────────
  async startStreaming(userMessage: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.audioQueue.clear();
    this.startTime = performance.now();
    this.updateState({
      phase: "thinking", partialText: "", fullText: "",
      audioChunks: 0, totalAudioChunks: 0, latencyMs: 0,
      tokenCount: 0, streaming: true,
    });

    try {
      const response = await fetch("/api/realtime-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: this.config.memoryId,
          name: this.config.name,
          relationship: this.config.relationship,
          lifeStory: this.config.lifeStory,
          userMessage,
          emotion: this.config.emotion,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        this.updateState({ phase: "idle", streaming: false });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let firstToken = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                this.updateState({
                  partialText: fullText,
                  tokenCount: this.state.tokenCount + 1,
                  phase: "thinking",
                });

                if (firstToken) {
                  firstToken = false;
                  this.updateState({ latencyMs: performance.now() - this.startTime });
                }
              }

              if (parsed.audioChunk) {
                const idx = this.state.audioChunks;
                this.audioQueue.addChunk(parsed.audioChunk, idx);
                this.updateState({
                  audioChunks: idx + 1,
                  phase: this.state.phase === "thinking" ? "speaking" : this.state.phase,
                });
              }

              if (parsed.emotion) {
                this.config.emotion = parsed.emotion;
              }

              if (parsed.totalAudioChunks) {
                this.updateState({ totalAudioChunks: parsed.totalAudioChunks });
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      this.updateState({
        fullText, streaming: false,
        phase: this.audioQueue.isPlaying ? "speaking" : "responding",
      });

    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      this.updateState({ phase: "idle", streaming: false });
    }
  }

  // ─── Abort current session ────────────────────────────────
  abort(): void {
    this.abortController?.abort();
    this.audioQueue.clear();
    this.updateState({ phase: "idle", streaming: false, partialText: "" });
  }

  // ─── Set emotion ──────────────────────────────────────────
  setEmotion(emotion: string): void {
    this.config.emotion = emotion;
  }

  destroy(): void {
    this.abort();
    this.abortController = null;
    this.onStateChange = null;
  }
}
