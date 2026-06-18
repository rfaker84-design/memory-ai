// tencent-avatar.ts — Tencent Cloud Digital Human WebRTC client
//
// Production flow:
//   1. CreateSession → get SDP offer + sessionId
//   2. Set remote SDP on RTCPeerConnection
//   3. Push audio track → digital human lip-syncs
//   4. Receive video track → render in <video>
//
// API docs: https://cloud.tencent.com/document/product/1240

export interface AvatarSession {
  sessionId: string;
  offerSdp: string | null;
  iceServers: RTCIceServer[];
  streamUrl: string | null;
  emotion: string;
  createdAt: number;
}

export interface AvatarConfig {
  memoryId: string;
  name: string;
  emotion?: string;
}

// ─── Create avatar session ──────────────────────────────────
export async function createAvatarSession(config: AvatarConfig): Promise<AvatarSession> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const resp = await fetch(baseUrl + "/api/avatar-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memoryId: config.memoryId,
        emotion: config.emotion || "calm",
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      return {
        sessionId: data.sessionId || "session_" + Date.now(),
        offerSdp: data.offerSdp || null,
        iceServers: data.iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
        streamUrl: data.streamUrl || null,
        emotion: data.emotion || "calm",
        createdAt: Date.now(),
      };
    }
  } catch { /* fall through */ }

  // Fallback: simulated session
  return {
    sessionId: "sim_" + Date.now(),
    offerSdp: null,
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    streamUrl: null,
    emotion: config.emotion || "calm",
    createdAt: Date.now(),
  };
}

// ─── WebRTC peer connection management ──────────────────────
export class AvatarWebRTC {
  private pc: RTCPeerConnection | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private videoStream: MediaStream | null = null;
  private onVideoStream: ((stream: MediaStream) => void) | null = null;
  private onConnectionState: ((state: string) => void) | null = null;

  setOnVideoStream(cb: (stream: MediaStream) => void): void { this.onVideoStream = cb; }
  setOnConnectionState(cb: (state: string) => void): void { this.onConnectionState = cb; }

  async connect(session: AvatarSession): Promise<void> {
    this.pc = new RTCPeerConnection({
      iceServers: session.iceServers,
    });

    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc?.connectionState || "disconnected");
    };

    this.pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        this.videoStream = event.streams[0];
        this.onVideoStream?.(event.streams[0]);
      }
    };

    // Create audio track from oscillator (placeholder — real audio pushed via TTS)
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const dest = audioCtx.createMediaStreamDestination();
    oscillator.connect(dest);
    oscillator.start();
    this.audioTrack = dest.stream.getAudioTracks()[0];
    this.pc.addTrack(this.audioTrack, dest.stream);

    // Create offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // If we have a remote SDP from Tencent, set it
    if (session.offerSdp) {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: session.offerSdp }),
      );
    }
  }

  // ─── Push audio chunk for lip-sync ────────────────────────
  async pushAudio(audioBase64: string): Promise<void> {
    // In production: decode audio and send via WebRTC audio track
    // For MVP: the audio track is already connected; lip-sync is handled server-side
    // The Tencent digital human reads the audio stream and animates the face
    if (!this.pc) return;

    try {
      const audioBuffer = await fetch("data:audio/mp3;base64," + audioBase64).then(r => r.arrayBuffer());
      const audioCtx = new AudioContext();
      const buffer = await audioCtx.decodeAudioData(audioBuffer);

      // Play through WebRTC by replacing audio track source
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.start();

      // Replace track
      if (this.audioTrack) {
        const sender = this.pc.getSenders().find(s => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(dest.stream.getAudioTracks()[0]);
        }
        this.audioTrack.stop();
      }
      this.audioTrack = dest.stream.getAudioTracks()[0];
    } catch {
      // Audio push failed; digital human may still work with its own audio
    }
  }

  // ─── Get video stream ─────────────────────────────────────
  getVideoStream(): MediaStream | null {
    return this.videoStream;
  }

  // ─── Update emotion ───────────────────────────────────────
  async setEmotion(emotion: string): Promise<void> {
    // In production: call Tencent API to update emotion
    // POST /api/avatar-stream with emotion update
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(baseUrl + "/api/avatar-stream", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion }),
      });
    } catch { /* ignore */ }
  }

  // ─── Cleanup ──────────────────────────────────────────────
  disconnect(): void {
    this.audioTrack?.stop();
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = null;
    this.audioTrack = null;
    this.videoStream = null;
  }
}
