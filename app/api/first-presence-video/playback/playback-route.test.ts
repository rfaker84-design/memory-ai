import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import {
  FirstPresencePlaybackAuthorizationService,
  FirstPresencePlaybackSigner,
  type ApprovedVideoArtifact,
  type VideoArtifactQueryPort,
  type VideoArtifactReaderPort,
} from "@/features/video";
import type { AuthSession } from "@/src/server/auth";
import { createFirstPresencePlaybackAuthorizationHandler } from "@/app/api/memories/[id]/first-presence-video/[jobId]/playback/_handler";
import { createFirstPresencePlaybackReadHandler } from "./[token]/_handler";

const owner = "owner-a";
const memoryId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const secret = "playback-test-secret-which-is-at-least-32-bytes";

function artifact(overrides: Partial<ApprovedVideoArtifact> = {}): ApprovedVideoArtifact {
  return {
    memoryId,
    jobId,
    artifactKey: "first-presence/approved-video.mp4",
    playbackUrl: "https://unused.test/playback",
    playbackExpiresAt: "2026-07-30T00:00:00.000Z",
    saveAllowed: false,
    presentation: "initial_preview",
    ...overrides,
  };
}

class Query implements VideoArtifactQueryPort {
  constructor(private readonly value: ApprovedVideoArtifact | null = artifact()) {}

  async findApprovedForOwner(input: { externalUserId: string; memoryId: string; jobId: string }) {
    if (
      !this.value
      || input.externalUserId !== owner
      || input.memoryId !== this.value.memoryId
      || input.jobId !== this.value.jobId
    ) return null;
    return this.value;
  }
}

class Reader implements VideoArtifactReaderPort {
  readonly calls: Array<{ artifactKey: string; start?: number; end?: number; rendition?: "mobile" }> = [];
  constructor(private readonly body = Buffer.from("0123456789")) {}

  async readRange(input: { artifactKey: string; start?: number; end?: number }) {
    this.calls.push(input);
    if (input.artifactKey.includes("..") || input.artifactKey.includes("\\")) throw new Error("STORAGE_INVALID_KEY");
    const start = input.start ?? 0;
    const end = input.end ?? this.body.byteLength - 1;
    return {
      body: this.body.subarray(start, end + 1),
      contentType: "video/mp4",
      totalBytes: this.body.byteLength,
    };
  }
}

const session = (externalUserId = owner) => async () => ({ externalUserId } as AuthSession);
const issue = (signer: FirstPresencePlaybackSigner, value = artifact(), externalUserId = owner) =>
  signer.issue({ artifact: value, externalUserId }).token;
const readRequest = (token: string, range?: string, rendition?: "mobile") => new NextRequest(
  `https://memoryai.test/api/first-presence-video/playback/${token}${rendition ? `?rendition=${rendition}` : ""}`,
  { headers: range ? { range } : undefined },
);

function readHandler(query = new Query(), reader = new Reader(), signer = new FirstPresencePlaybackSigner(secret), externalUserId = owner) {
  return {
    handler: createFirstPresencePlaybackReadHandler(() => ({ artifacts: query, reader, signer }), session(externalUserId)),
    signer,
    reader,
  };
}

test("owner playback authorization returns only the controlled inline projection", async () => {
  const signer = new FirstPresencePlaybackSigner(secret);
  const handler = createFirstPresencePlaybackAuthorizationHandler(
    () => new FirstPresencePlaybackAuthorizationService(new Query(), signer),
    session(),
  );
  const response = await handler.GET(new NextRequest(
    `https://memoryai.test/api/memories/${memoryId}/first-presence-video/${jobId}/playback`,
  ), { params: Promise.resolve({ id: memoryId, jobId }) });
  assert.equal(response.status, 200);
  const body = await response.json() as { playback: Record<string, unknown> };
  assert.deepEqual(Object.keys(body.playback).sort(), ["contentDisposition", "expiresAt", "saveAllowed", "url"]);
  assert.equal(body.playback.contentDisposition, "inline");
  assert.equal(body.playback.saveAllowed, false);
  assert.doesNotMatch(JSON.stringify(body), /artifactKey|approved-video|providerTask|manualReview/);
});

test("approved owner playback returns the complete MP4 with controlled headers", async () => {
  const { handler, signer } = readHandler();
  const token = issue(signer);
  const response = await handler.GET(readRequest(token), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.match(response.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal(response.headers.get("x-ai-generated-content"), "true");
  assert.equal(response.headers.get("x-ai-content-id"), jobId);
  assert.equal(response.headers.get("x-content-disclosure"), "ai-generated");
});

test("approved owner playback supports a single byte range", async () => {
  const { handler, signer, reader } = readHandler();
  const token = issue(signer);
  const response = await handler.GET(readRequest(token, "bytes=2-5"), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(reader.calls.length, 2);
});

test("approved owner playback permits only the fixed mobile delivery rendition", async () => {
  const { handler, signer, reader } = readHandler();
  const token = issue(signer);
  const response = await handler.GET(readRequest(token, undefined, "mobile"), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
  assert.equal(reader.calls[0]?.rendition, "mobile");
  const invalid = await handler.GET(new NextRequest(`https://memoryai.test/api/first-presence-video/playback/${token}?rendition=source`), { params: Promise.resolve({ token }) });
  assert.equal(invalid.status, 404);
});

test("expired or tampered playback tokens are uniformly unreadable", async () => {
  const { handler, signer } = readHandler();
  const expired = signer.issue({ artifact: artifact(), externalUserId: owner, now: new Date(0), ttlSeconds: 1 }).token;
  const expiredResponse = await handler.GET(readRequest(expired), { params: Promise.resolve({ token: expired }) });
  assert.equal(expiredResponse.status, 404);
  const valid = issue(signer);
  const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;
  const tamperedResponse = await handler.GET(readRequest(tampered), { params: Promise.resolve({ token: tampered }) });
  assert.equal(tamperedResponse.status, 404);
});

test("previous playback signing key preserves owner and artifact binding only during rotation", async () => {
  const previous = "previous-playback-secret-which-is-at-least-32-bytes";
  const oldToken = issue(new FirstPresencePlaybackSigner(previous));
  const { handler } = readHandler(new Query(), new Reader(), new FirstPresencePlaybackSigner(secret, previous));
  const response = await handler.GET(readRequest(oldToken), { params: Promise.resolve({ token: oldToken }) });
  assert.equal(response.status, 200);
  const mismatched = readHandler(new Query(), new Reader(), new FirstPresencePlaybackSigner(secret, previous), "attacker");
  const denied = await mismatched.handler.GET(readRequest(oldToken), { params: Promise.resolve({ token: oldToken }) });
  assert.equal(denied.status, 404);
});

test("cross-user, unapproved, and path-escape artifacts cannot be read", async () => {
  const crossUser = readHandler(new Query(), new Reader(), new FirstPresencePlaybackSigner(secret), "attacker");
  const token = issue(crossUser.signer);
  const crossUserResponse = await crossUser.handler.GET(readRequest(token), { params: Promise.resolve({ token }) });
  assert.equal(crossUserResponse.status, 404);

  const unapproved = readHandler(new Query(null));
  const unapprovedToken = issue(unapproved.signer);
  const unapprovedResponse = await unapproved.handler.GET(readRequest(unapprovedToken), { params: Promise.resolve({ token: unapprovedToken }) });
  assert.equal(unapprovedResponse.status, 404);

  const escapedArtifact = artifact({ artifactKey: "../../outside.mp4" });
  const escaped = readHandler(new Query(escapedArtifact));
  const escapedToken = issue(escaped.signer, escapedArtifact);
  const escapedResponse = await escaped.handler.GET(readRequest(escapedToken), { params: Promise.resolve({ token: escapedToken }) });
  assert.equal(escapedResponse.status, 404);
});

test("invalid and multi-range requests are rejected without exposing the artifact", async () => {
  const { handler, signer } = readHandler();
  const token = issue(signer);
  const response = await handler.GET(readRequest(token, "bytes=0-1,3-4"), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */10");
});
