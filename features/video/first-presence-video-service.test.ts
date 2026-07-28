import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateFirstPresenceQuality,
  FirstPresenceVideoService,
  ViduFirstPresenceNetworkError,
  ViduFirstPresenceProvider,
  VIDU_CN_API_BASE_URL,
  VIDU_FIRST_PRESENCE_DURATION_SECONDS,
  VIDU_FIRST_PRESENCE_MODEL,
  VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT,
  VIDU_FIRST_PRESENCE_PROMPT,
  VIDU_FIRST_PRESENCE_RESOLUTION,
  type FirstPresenceArtifactStore,
  type FirstPresenceEntitlementPort,
  type FirstPresenceMediaProbe,
  type FirstPresenceVideoJob,
  type FirstPresenceVideoRepository,
  type FirstPresenceVisualCheck,
} from "./index";

const owner = "phone:owner";
const memoryId = "00000000-0000-4000-8000-000000000021";
const image = "data:image/png;base64,YWJj";
const sha = "a".repeat(64);

class MemoryFirstPresenceRepository implements FirstPresenceVideoRepository {
  readonly jobs = new Map<string, FirstPresenceVideoJob>();
  private sequence = 0;

  async findByIdempotencyKey(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
  }) {
    return (
      [...this.jobs.values()].find(
        (job) =>
          job.externalUserId === input.externalUserId &&
          job.memoryId === input.memoryId &&
          job.idempotencyKey === input.idempotencyKey
      ) ?? null
    );
  }

  async findById(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async createQueued(input: {
    externalUserId: string;
    memoryId: string;
    idempotencyKey: string;
    imageSha256: string;
  }) {
    const now = new Date().toISOString();
    const job: FirstPresenceVideoJob = {
      id: `first-presence-video-${++this.sequence}`,
      externalUserId: input.externalUserId,
      memoryId: input.memoryId,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      provider: "vidu-cn-q2-pro-fast",
      providerTaskId: null,
      providerState: null,
      inputSha256: input.imageSha256,
      actualCredits: null,
      artifactKey: null,
      quality: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async markSubmitting(id: string) {
    return this.patch(id, { status: "submitting" });
  }

  async markSubmitted(input: {
    id: string;
    providerTaskId: string;
    providerState: string;
    actualCredits: number | null;
  }) {
    return this.patch(input.id, {
      status: "submitted",
      providerTaskId: input.providerTaskId,
      providerState: input.providerState,
      actualCredits: input.actualCredits,
    });
  }

  async markRunning(input: {
    id: string;
    providerState: string;
    actualCredits: number | null;
  }) {
    return this.patch(input.id, {
      status: "running",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
    });
  }

  async markSubmissionUncertain(input: { id: string; errorCode: string }) {
    return this.patch(input.id, {
      status: "submission_uncertain",
      errorCode: input.errorCode,
    });
  }

  async markFailed(input: {
    id: string;
    providerState: string | null;
    actualCredits: number | null;
    errorCode: string;
  }) {
    return this.patch(input.id, {
      status: "failed",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      errorCode: input.errorCode,
    });
  }

  async markRejected(input: Parameters<FirstPresenceVideoRepository["markRejected"]>[0]) {
    return this.patch(input.id, {
      status: "rejected",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      artifactKey: input.artifactKey,
      quality: input.quality,
      errorCode: input.errorCode,
    });
  }

  async markSucceeded(input: Parameters<FirstPresenceVideoRepository["markSucceeded"]>[0]) {
    return this.patch(input.id, {
      status: "succeeded",
      providerState: input.providerState,
      actualCredits: input.actualCredits,
      artifactKey: input.artifactKey,
      quality: input.quality,
    });
  }

  private patch(id: string, patch: Partial<FirstPresenceVideoJob>) {
    const current = this.jobs.get(id);
    if (!current) throw new Error("missing job");
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }
}

class FakeEntitlements implements FirstPresenceEntitlementPort {
  reserves = 0;
  commits = 0;
  releases = 0;

  async reserve() {
    this.reserves += 1;
    return "reserved" as const;
  }

  async release() {
    this.releases += 1;
  }

  async commit() {
    this.commits += 1;
  }
}

function serviceWith(input: {
  provider?: ConstructorParameters<typeof FirstPresenceVideoService>[1];
  media?: FirstPresenceMediaProbe;
  visual?: FirstPresenceVisualCheck;
}) {
  const repository = new MemoryFirstPresenceRepository();
  const entitlements = new FakeEntitlements();
  const artifacts: FirstPresenceArtifactStore = {
    download: async () => ({
      artifactKey: "first-presence/video.mp4",
      body: Buffer.from("mp4"),
    }),
  };
  const provider =
    input.provider ??
    ({
      submit: async () => ({
        taskId: "vidu-task-1",
        providerState: "created",
        credits: 44,
      }),
      poll: async () => ({
        state: "succeeded",
        providerState: "success",
        credits: 44,
        outputUrl: "https://example.test/video.mp4",
      }),
    } as ConstructorParameters<typeof FirstPresenceVideoService>[1]);
  const service = new FirstPresenceVideoService(
    repository,
    provider,
    entitlements,
    artifacts,
    {
      probe: async () =>
        input.media ?? {
          durationSeconds: 8.083,
          width: 1080,
          height: 1920,
          codec: "h264",
          hasAudio: false,
        },
    },
    {
      analyze: async () =>
        input.visual ?? {
          personPresent: true,
          finalFramePersonPresent: true,
          personLeftFrame: false,
          bodyOrHandAbnormal: false,
        },
    }
  );
  return { service, repository, entitlements };
}

test("Vidu first-presence provider freezes the China Q2 Pro Fast 8s silent 1080p contract", async () => {
  const requests: Array<{
    url: string;
    method: string;
    authorization: string | null;
    body: Record<string, unknown>;
  }> = [];
  const fakeFetch = (async (
    request: URL | RequestInfo,
    init?: RequestInit
  ) => {
    requests.push({
      url: String(request),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    if (String(request).endsWith("/img2video")) {
      return Response.json({ task_id: "vidu-task-1", state: "created", credits: 44 });
    }
    return Response.json({
      state: "success",
      credits: 44,
      creations: [{ url: "https://example.test/video.mp4" }],
    });
  }) as typeof fetch;
  const provider = new ViduFirstPresenceProvider({
    environment: { VIDU_API_KEY: "raw-key" },
    fetchImpl: fakeFetch,
  });

  await provider.submit({
    imageDataUrl: image,
    imageSha256: sha,
    idempotencyKey: "first-presence-job-1",
  });
  await provider.poll("vidu-task-1");

  assert.deepEqual(
    requests.map((request) => [request.url, request.method]),
    [
      [`${VIDU_CN_API_BASE_URL}/ent/v2/img2video`, "POST"],
      [`${VIDU_CN_API_BASE_URL}/ent/v2/tasks/vidu-task-1/creations`, "GET"],
    ]
  );
  assert.equal(requests[0].authorization, "Token raw-key");
  assert.equal(requests[1].authorization, "Token raw-key");
  assert.equal(requests[0].body.model, VIDU_FIRST_PRESENCE_MODEL);
  assert.equal(requests[0].body.duration, VIDU_FIRST_PRESENCE_DURATION_SECONDS);
  assert.equal(requests[0].body.resolution, VIDU_FIRST_PRESENCE_RESOLUTION);
  assert.equal(requests[0].body.audio, false);
  assert.equal(requests[0].body.bgm, false);
  assert.equal(requests[0].body.is_rec, false);
  assert.equal(requests[0].body.prompt, VIDU_FIRST_PRESENCE_PROMPT);
  assert.equal(requests[0].body.negative_prompt, VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT);
});

test("idempotent product submission reuses the existing job and does not reserve or submit twice", async () => {
  let submits = 0;
  const { service, entitlements } = serviceWith({
    provider: {
      submit: async () => {
        submits += 1;
        return { taskId: "vidu-task-1", providerState: "created", credits: 44 };
      },
      poll: async () => {
        throw new Error("unused");
      },
    },
  });
  const input = {
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-1",
    imageDataUrl: image,
    imageSha256: sha,
  };

  const first = await service.submit(input);
  const duplicate = await service.submit(input);

  assert.equal(first.id, duplicate.id);
  assert.equal(submits, 1);
  assert.equal(entitlements.reserves, 1);
});

test("network loss during submit is recorded as uncertain and is not retried by idempotent replay", async () => {
  let submits = 0;
  const { service, entitlements } = serviceWith({
    provider: {
      submit: async () => {
        submits += 1;
        throw new ViduFirstPresenceNetworkError();
      },
      poll: async () => {
        throw new Error("unused");
      },
    },
  });
  const input = {
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-2",
    imageDataUrl: image,
    imageSha256: sha,
  };

  const first = await service.submit(input);
  const replay = await service.submit(input);

  assert.equal(first.status, "submission_uncertain");
  assert.equal(replay.id, first.id);
  assert.equal(submits, 1);
  assert.equal(entitlements.commits, 0);
});

test("state recovery polls an existing provider task, stores actual credits, and commits only after quality pass", async () => {
  const { service, repository, entitlements } = serviceWith({});
  const submitted = await service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-3",
    imageDataUrl: image,
    imageSha256: sha,
  });

  const recovered = await service.recover(submitted.id);

  assert.equal(recovered.status, "succeeded");
  assert.equal(recovered.actualCredits, 44);
  assert.equal(recovered.artifactKey, "first-presence/video.mp4");
  assert.equal(recovered.quality?.status, "pass");
  assert.equal(repository.jobs.size, 1);
  assert.equal(entitlements.commits, 1);
  assert.equal(entitlements.releases, 0);
});

test("provider failure and quality rejection release the reserved user entitlement", async () => {
  const failing = serviceWith({
    provider: {
      submit: async () => ({ taskId: "vidu-task-fail", providerState: "created", credits: 44 }),
      poll: async () => ({
        state: "failed",
        providerState: "failed",
        credits: 44,
        errorCode: "VIDU_FAILED",
      }),
    },
  });
  const failed = await failing.service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-4",
    imageDataUrl: image,
    imageSha256: sha,
  });
  assert.equal((await failing.service.recover(failed.id)).status, "failed");
  assert.equal(failing.entitlements.releases, 1);
  assert.equal(failing.entitlements.commits, 0);

  const rejected = serviceWith({
    visual: {
      personPresent: true,
      finalFramePersonPresent: false,
      personLeftFrame: true,
      bodyOrHandAbnormal: true,
    },
  });
  const job = await rejected.service.submit({
    externalUserId: owner,
    memoryId,
    idempotencyKey: "video-request-5",
    imageDataUrl: image,
    imageSha256: sha,
  });
  const result = await rejected.service.recover(job.id);
  assert.equal(result.status, "rejected");
  assert.deepEqual(result.quality?.status, "reject");
  assert.match(result.errorCode ?? "", /PERSON_LEFT_FRAME|FINAL_FRAME_PERSON_MISSING|BODY_OR_HAND_ABNORMAL/);
  assert.equal(rejected.entitlements.releases, 1);
  assert.equal(rejected.entitlements.commits, 0);
});

test("quality gate rejects bad media, missing final person, leaving frame, and obvious body or hand defects", () => {
  assert.deepEqual(
    evaluateFirstPresenceQuality({
      media: {
        durationSeconds: 10,
        width: 720,
        height: 1280,
        codec: "",
        hasAudio: true,
      },
      visual: {
        personPresent: false,
        finalFramePersonPresent: false,
        personLeftFrame: true,
        bodyOrHandAbnormal: true,
      },
    }).reasons,
    [
      "MEDIA_DURATION_INVALID",
      "MEDIA_RESOLUTION_INVALID",
      "MEDIA_AUDIO_PRESENT",
      "MEDIA_CODEC_MISSING",
      "PERSON_MISSING",
      "PERSON_LEFT_FRAME",
      "FINAL_FRAME_PERSON_MISSING",
      "BODY_OR_HAND_ABNORMAL",
    ]
  );
});
