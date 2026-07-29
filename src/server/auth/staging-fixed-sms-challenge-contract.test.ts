import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { createSendCodeHandler } from "@/app/api/auth/send-code/_handler";
import { createVerifyCodeHandler } from "@/app/api/auth/verify-code/_handler";

import type {
  AuthRepositoryPort,
  ChallengeCreateResult,
  ChallengeVerifyResult,
  NewChallenge,
} from "./auth-repository";
import { AuthService } from "./auth-service";
import { AUTH_POLICY } from "./config";
import { digestVerificationCode, verificationDigestsEqual } from "./crypto";
import { SmsProviderError, type SmsVerificationSendInput, type SmsVerificationSendResult } from "./sms/sms-verification-provider";
import { StagingFixedSmsVerificationProvider } from "./sms/staging-fixed-sms-verification-provider";
import { getSmsVerificationProvider } from "./sms/tencent-sms-verification-provider";

const FIXED_CODE = "246810";
const FIRST_NATIONAL_PHONE = "18800000001";
const FIRST_E164_PHONE = `+86${FIRST_NATIONAL_PHONE}`;
const SECOND_E164_PHONE = "+8618800000002";

const stagingEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "staging",
  DATABASE_URL: "postgresql://staging:secret@127.0.0.1:5432/memoryai_staging",
  STAGING_DATABASE_ISOLATION: "isolated",
  STAGING_DATABASE_NAME: "memoryai_staging",
  STAGING_DATA_SOURCE: "empty",
  AUTH_ALLOWED_ORIGIN: "https://app.staging.yijianmemory.cn",
  AUTH_TRUST_NGINX_PROXY: "true",
  AUTH_PROXY_LOOPBACK_ONLY: "true",
  AUTH_VERIFICATION_PEPPER: "test-only-pepper-value-with-at-least-32-bytes",
  SESSION_SECRET: "test-only-session-value-with-at-least-32-bytes",
  STAGING_ACCESS_TOKEN: "a".repeat(48),
  STAGING_FIXED_SMS_CODE: FIXED_CODE,
  STAGING_FIXED_SMS_PHONES: `${FIRST_E164_PHONE},${SECOND_E164_PHONE}`,
  STAGING_MEDIA_ROOT: "/var/lib/memoryai-staging/media",
  STAGING_MEDIA_SIGNING_SECRET: "m".repeat(32),
  LLM_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
};

class InMemoryAuthRepository implements AuthRepositoryPort {
  challenge?: NewChallenge & { attempts: number; consumed: boolean };
  createCalls = 0;
  providerRequestId: string | null = null;
  createResult: ChallengeCreateResult = "created";

  async createChallenge(input: NewChallenge): Promise<ChallengeCreateResult> {
    this.createCalls += 1;
    if (this.createResult === "created") this.challenge = { ...input, attempts: 0, consumed: false };
    return this.createResult;
  }

  async setProviderRequestId(_challengeId: string, providerRequestId: string | null): Promise<void> {
    this.providerRequestId = providerRequestId;
  }

  async discardChallenge(): Promise<void> {
    this.challenge = undefined;
  }

  async verifyAndConsume(input: {
    challengeId: string;
    phoneHash: string;
    candidateDigest: string;
    externalUserId: string;
    now: Date;
  }): Promise<ChallengeVerifyResult> {
    const challenge = this.challenge;
    if (
      !challenge
      || challenge.challengeId !== input.challengeId
      || challenge.phoneHash !== input.phoneHash
      || challenge.consumed
      || challenge.expiresAt <= input.now
      || challenge.attempts >= AUTH_POLICY.maxAttempts
    ) return { status: "invalid" };
    if (!verificationDigestsEqual(challenge.codeDigest, input.candidateDigest)) {
      challenge.attempts += 1;
      return { status: "invalid" };
    }
    challenge.consumed = true;
    return {
      status: "verified",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        externalUserId: input.externalUserId,
        createdAt: input.now.toISOString(),
      },
    };
  }
}

class CountingStagingProvider extends StagingFixedSmsVerificationProvider {
  deliveryCalls = 0;

  async sendVerificationCode(input: SmsVerificationSendInput): Promise<SmsVerificationSendResult> {
    this.deliveryCalls += 1;
    return super.sendVerificationCode(input);
  }
}

async function withStagingEnvironment(work: () => Promise<void> | void): Promise<void> {
  const previous = new Map(Object.keys(stagingEnvironment).map((name) => [name, process.env[name]]));
  Object.assign(process.env, stagingEnvironment);
  try {
    await work();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function request(pathname: string, body: Record<string, string>) {
  return new NextRequest(`https://api.staging.yijianmemory.cn${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.staging.yijianmemory.cn",
      "x-real-ip": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

test("staging fixed SMS binds normalized allowed recipients and persisted material to one configuration snapshot", async () => {
  await withStagingEnvironment(async () => {
    const explicitEnvironment = { ...stagingEnvironment, STAGING_FIXED_SMS_CODE: "135790" };
    const explicitProvider = getSmsVerificationProvider(explicitEnvironment);
    assert.equal(explicitProvider.prepareVerificationCode?.(FIRST_E164_PHONE), "135790");

    const firstRepository = new InMemoryAuthRepository();
    const firstService = new AuthService(firstRepository, getSmsVerificationProvider());
    const firstSent = await firstService.sendCode(FIRST_NATIONAL_PHONE, "127.0.0.1");
    assert.equal(firstSent.status, "sent");
    assert.ok(firstRepository.challenge);
    const firstChallenge = firstRepository.challenge;
    assert.ok(verificationDigestsEqual(
      firstChallenge.codeDigest,
      digestVerificationCode(firstChallenge.challengeId, FIXED_CODE),
    ));
    assert.equal(
      (await firstService.verifyCode({
        phone: FIRST_NATIONAL_PHONE,
        code: FIXED_CODE,
        challengeId: firstSent.challengeId,
      })).status,
      "verified",
    );

    const secondRepository = new InMemoryAuthRepository();
    const secondService = new AuthService(secondRepository, getSmsVerificationProvider());
    const secondSent = await secondService.sendCode(FIRST_E164_PHONE, "127.0.0.1");
    assert.equal(secondSent.status, "sent");
    assert.ok(secondRepository.challenge);
    assert.equal(firstChallenge.phoneHash, secondRepository.challenge.phoneHash);
    assert.equal(
      (await secondService.verifyCode({
        phone: FIRST_NATIONAL_PHONE,
        code: FIXED_CODE,
        challengeId: secondSent.challengeId,
      })).status,
      "verified",
    );
  });
});

test("staging fixed SMS rejects a non-allowlisted recipient before any challenge write or delivery", async () => {
  await withStagingEnvironment(async () => {
    const repository = new InMemoryAuthRepository();
    const provider = new CountingStagingProvider();
    const service = new AuthService(repository, provider);
    const send = createSendCodeHandler(() => service);
    const rejected = await send(request("/api/auth/send-code", { phone: "18800000003" }));

    assert.equal(rejected.status, 503);
    assert.deepEqual(await rejected.json(), { error: "SMS_REJECTED" });
    assert.equal(repository.createCalls, 0);
    assert.equal(repository.challenge, undefined);
    assert.equal(provider.deliveryCalls, 0);
  });
});

test("staging fixed SMS preserves failed-attempt and secure-session behavior through the formal handlers", async () => {
  await withStagingEnvironment(async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, getSmsVerificationProvider());
    const send = createSendCodeHandler(() => service);
    const verify = createVerifyCodeHandler(() => service);

    const sent = await send(request("/api/auth/send-code", { phone: FIRST_NATIONAL_PHONE }));
    assert.equal(sent.status, 202);
    const { challengeId } = await sent.json() as { challengeId: string };

    const wrong = await verify(request("/api/auth/verify-code", {
      phone: FIRST_E164_PHONE,
      code: "000000",
      challengeId,
    }));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.headers.get("set-cookie"), null);
    assert.equal(repository.challenge?.attempts, 1);

    const verified = await verify(request("/api/auth/verify-code", {
      phone: FIRST_E164_PHONE,
      code: FIXED_CODE,
      challengeId,
    }));
    assert.equal(verified.status, 200);
    assert.equal((await verified.json() as { authenticated?: boolean }).authenticated, true);
    assert.match(verified.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(verified.headers.get("set-cookie") ?? "", /Secure/i);
    assert.equal(repository.challenge?.consumed, true);

    const replay = await verify(request("/api/auth/verify-code", {
      phone: FIRST_NATIONAL_PHONE,
      code: FIXED_CODE,
      challengeId,
    }));
    assert.equal(replay.status, 400);
    assert.equal(replay.headers.get("set-cookie"), null);
  });
});

test("an existing staging challenge remains rate-limited without replacing its fixed-code material", async () => {
  await withStagingEnvironment(async () => {
    const repository = new InMemoryAuthRepository();
    const provider = new CountingStagingProvider();
    const service = new AuthService(repository, provider);
    const sent = await service.sendCode(FIRST_NATIONAL_PHONE, "127.0.0.1");
    assert.equal(sent.status, "sent");
    const digest = repository.challenge?.codeDigest;
    repository.createResult = "rate_limited";
    const duplicate = await service.sendCode(FIRST_E164_PHONE, "127.0.0.1");
    assert.deepEqual(duplicate, { status: "rate_limited" });
    assert.equal(repository.challenge?.codeDigest, digest);
    assert.equal(provider.deliveryCalls, 1);
  });
});

test("ordinary production continues to reject the legacy fixed SMS provider", () => {
  assert.throws(
    () => getSmsVerificationProvider({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      AUTH_SMS_PROVIDER: "fixed",
      AUTH_FIXED_SMS_CODE: FIXED_CODE,
      AUTH_FIXED_SMS_ALLOWED_PHONES: `${FIRST_E164_PHONE},${SECOND_E164_PHONE}`,
    }),
    (error: unknown) => error instanceof SmsProviderError && error.code === "SMS_PROVIDER_CONFIGURATION_INVALID",
  );
});
