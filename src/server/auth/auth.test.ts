import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { decodeJwt, SignJWT } from "jose";
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
import { AUTH_POLICY, AUTH_SESSION_COOKIE } from "./config";
import { generateVerificationCode, sessionSecret, verificationDigestsEqual } from "./crypto";
import { issueSession, verifySessionToken } from "./session";
import { FakeSmsVerificationProvider } from "./sms/fake-sms-verification-provider";
import {
  getSmsVerificationProvider,
  TencentSmsVerificationProvider,
} from "./sms/tencent-sms-verification-provider";

process.env.AUTH_VERIFICATION_PEPPER = "test-only-pepper-value-with-at-least-32-bytes";
process.env.SESSION_SECRET = "test-only-session-value-with-at-least-32-bytes";
process.env.AUTH_ALLOWED_ORIGIN = "https://memoryai.test";
process.env.AUTH_TRUST_NGINX_PROXY = "true";
process.env.AUTH_PROXY_LOOPBACK_ONLY = "true";

class InMemoryAuthRepository implements AuthRepositoryPort {
  challenge?: NewChallenge & { attempts: number; consumed: boolean };
  createResult: ChallengeCreateResult = "created";
  providerRequestId: string | null = null;
  createCalls = 0;

  async createChallenge(input: NewChallenge): Promise<ChallengeCreateResult> {
    this.createCalls += 1;
    if (this.createResult === "created") {
      this.challenge = { ...input, attempts: 0, consumed: false };
    }
    return this.createResult;
  }

  async setProviderRequestId(_challengeId: string, value: string | null): Promise<void> {
    this.providerRequestId = value;
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

test("SMS configuration failure returns 503 before a challenge or session can be created", async (t) => {
  const names = [
    "TENCENT_SMS_SECRET_ID",
    "TENCENT_SMS_SECRET_KEY",
    "TENCENT_SMS_REGION",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const fixture of ["missing", "partial"] as const) {
    await t.test(fixture, async () => {
      for (const name of names) delete process.env[name];
      if (fixture === "partial") process.env.TENCENT_SMS_SECRET_ID = "partial-only";
      try {
        const repository = new InMemoryAuthRepository();
        const handler = createSendCodeHandler(
          () => new AuthService(repository, new TencentSmsVerificationProvider())
        );
        const response = await handler(new NextRequest("https://memoryai.test/api/auth/send-code", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://memoryai.test",
            "x-real-ip": "127.0.0.1",
          },
          body: JSON.stringify({ phone: "13800000000" }),
        }));
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "SMS_PROVIDER_CONFIGURATION_INVALID" });
        assert.equal(repository.createCalls, 0);
        assert.equal(repository.challenge, undefined);
        assert.equal(response.headers.get("set-cookie"), null);
      } finally {
        for (const name of names) {
          const value = previous.get(name);
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    });
  }
});

test("send code uses fake provider and never exposes the verification code", async () => {
  const repository = new InMemoryAuthRepository();
  const provider = new FakeSmsVerificationProvider();
  const service = new AuthService(repository, provider);
  const handler = createSendCodeHandler(() => service);
  const response = await handler(new NextRequest("https://memoryai.test/api/auth/send-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://memoryai.test",
      "x-real-ip": "127.0.0.1",
    },
    body: JSON.stringify({ phone: "13800000000" }),
  }));
  const json = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 202);
  assert.equal(json.accepted, true);
  assert.equal("code" in json, false);
  assert.equal(provider.sent.length, 1);
  assert.match(provider.sent[0].code, /^\d{6}$/);
  assert.equal(repository.providerRequestId, "fake-request-id");
});

test("an explicitly enabled non-production fixed provider completes the formal login route", async () => {
  const names = [
    "NODE_ENV",
    "AUTH_SMS_PROVIDER",
    "AUTH_FIXED_SMS_CODE",
    "AUTH_FIXED_SMS_ALLOWED_PHONES",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = "test";
    process.env.AUTH_SMS_PROVIDER = "fixed";
    process.env.AUTH_FIXED_SMS_CODE = "246810";
    process.env.AUTH_FIXED_SMS_ALLOWED_PHONES = "+8618800000001,+8618800000002";
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, getSmsVerificationProvider());
    const send = createSendCodeHandler(() => service);
    const verify = createVerifyCodeHandler(() => service);
    const headers = {
      "content-type": "application/json",
      origin: "https://memoryai.test",
      "x-real-ip": "127.0.0.1",
    };

    const sent = await send(new NextRequest("https://memoryai.test/api/auth/send-code", {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: "18800000001" }),
    }));
    assert.equal(sent.status, 202);
    const sentBody = await sent.json() as { challengeId: string };
    assert.ok(sentBody.challengeId);

    const verified = await verify(new NextRequest("https://memoryai.test/api/auth/verify-code", {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: "18800000001",
        code: "246810",
        challengeId: sentBody.challengeId,
      }),
    }));
    assert.equal(verified.status, 200);
    const verifiedBody = await verified.json() as { authenticated?: boolean };
    assert.equal(verifiedBody.authenticated, true);
    assert.match(verified.headers.get("set-cookie") ?? "", /HttpOnly/i);
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("formal SMS endpoints reject extra client-controlled fields before service calls", async () => {
  let sendCalls = 0;
  let verifyCalls = 0;
  const send = createSendCodeHandler(() => ({
    sendCode: async () => {
      sendCalls += 1;
      return { status: "rate_limited" as const };
    },
  }));
  const verify = createVerifyCodeHandler(() => ({
    verifyCode: async () => {
      verifyCalls += 1;
      return { status: "invalid" as const };
    },
  }));
  const headers = {
    "content-type": "application/json",
    origin: "https://memoryai.test",
    "x-real-ip": "127.0.0.1",
  };

  const sendResponse = await send(new NextRequest("https://memoryai.test/api/auth/send-code", {
    method: "POST", headers, body: JSON.stringify({ phone: "13800000000", userId: "attacker" }),
  }));
  const verifyResponse = await verify(new NextRequest("https://memoryai.test/api/auth/verify-code", {
    method: "POST", headers, body: JSON.stringify({
      phone: "13800000000", code: "123456", challengeId: "00000000-0000-4000-8000-000000000002", requestId: "attacker",
    }),
  }));

  assert.equal(sendResponse.status, 400);
  assert.equal(verifyResponse.status, 400);
  assert.equal(sendCalls, 0);
  assert.equal(verifyCalls, 0);
});

test("trusted proxy IP handling fails closed and ignores X-Forwarded-For", async (t) => {
  const request = (headers: Record<string, string>) => new NextRequest(
    "https://memoryai.test/api/auth/send-code",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://memoryai.test",
        ...headers,
      },
      body: JSON.stringify({ phone: "13800000000" }),
    },
  );
  const handler = createSendCodeHandler(() => new AuthService(
    new InMemoryAuthRepository(),
    new FakeSmsVerificationProvider(),
  ));

  await t.test("proxy trust disabled", async () => {
    process.env.AUTH_TRUST_NGINX_PROXY = "false";
    const response = await handler(request({ "x-real-ip": "127.0.0.1" }));
    assert.equal(response.status, 503);
    process.env.AUTH_TRUST_NGINX_PROXY = "true";
  });
  await t.test("loopback contract missing", async () => {
    process.env.AUTH_PROXY_LOOPBACK_ONLY = "false";
    const response = await handler(request({ "x-real-ip": "127.0.0.1" }));
    assert.equal(response.status, 503);
    process.env.AUTH_PROXY_LOOPBACK_ONLY = "true";
  });
  await t.test("multi-value X-Real-IP", async () => {
    const response = await handler(request({ "x-real-ip": "127.0.0.1, 10.0.0.1" }));
    assert.equal(response.status, 503);
  });
  await t.test("invalid X-Real-IP", async () => {
    const response = await handler(request({ "x-real-ip": "not-an-ip" }));
    assert.equal(response.status, 503);
  });
  await t.test("X-Forwarded-For is not an authority", async () => {
    const response = await handler(request({ "x-forwarded-for": "127.0.0.1" }));
    assert.equal(response.status, 503);
  });
});

test("verification rejects expiry, replay, and the sixth attempt", async (t) => {
  await t.test("expiry", async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, new FakeSmsVerificationProvider(), AUTH_POLICY,
      () => new Date("2026-07-15T00:00:00.000Z"));
    const sent = await service.sendCode("13800000000", "127.0.0.1");
    assert.equal(sent.status, "sent");
    if (repository.challenge) repository.challenge.expiresAt = new Date("2026-07-14T23:59:59.000Z");
    const result = await service.verifyCode({
      phone: "13800000000",
      code: repository.challenge ? "000000" : "",
      challengeId: sent.status === "sent" ? sent.challengeId : "",
    });
    assert.equal(result.status, "invalid");
  });

  await t.test("replay", async () => {
    const repository = new InMemoryAuthRepository();
    const provider = new FakeSmsVerificationProvider();
    const service = new AuthService(repository, provider);
    const sent = await service.sendCode("13800000000", "127.0.0.1");
    assert.equal(sent.status, "sent");
    const input = { phone: "13800000000", code: provider.sent[0].code, challengeId: sent.status === "sent" ? sent.challengeId : "" };
    assert.equal((await service.verifyCode(input)).status, "verified");
    assert.equal((await service.verifyCode(input)).status, "invalid");
  });

  await t.test("attempt limit", async () => {
    const repository = new InMemoryAuthRepository();
    const provider = new FakeSmsVerificationProvider();
    const service = new AuthService(repository, provider);
    const sent = await service.sendCode("13800000000", "127.0.0.1");
    assert.equal(sent.status, "sent");
    const challengeId = sent.status === "sent" ? sent.challengeId : "";
    for (let attempt = 0; attempt < AUTH_POLICY.maxAttempts; attempt += 1) {
      assert.equal((await service.verifyCode({ phone: "13800000000", code: "999999", challengeId })).status, "invalid");
    }
    assert.equal((await service.verifyCode({ phone: "13800000000", code: provider.sent[0].code, challengeId })).status, "invalid");
  });
});

test("verify handler sets an HttpOnly __Host cookie without returning a token", async () => {
  const handler = createVerifyCodeHandler(() => ({
    verifyCode: async () => ({
      status: "verified" as const,
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        externalUserId: "phone:test-hash",
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    }),
  }));
  const response = await handler(new NextRequest("https://memoryai.test/api/auth/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://memoryai.test" },
    body: JSON.stringify({ phone: "13800000000", code: generateVerificationCode(), challengeId: "00000000-0000-4000-8000-000000000002" }),
  }));
  const json = await response.json() as Record<string, unknown>;
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.equal("token" in json, false);
  assert.match(cookie, new RegExp(`^${AUTH_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//i);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("session rejects bad signatures and expired tokens", async () => {
  const valid = await issueSession({
    userId: "00000000-0000-4000-8000-000000000001",
    externalUserId: "phone:test-hash",
  });
  assert.ok(await verifySessionToken(valid));
  const [header, payload, signature] = valid.split(".");
  const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(
    await verifySessionToken(`${header}.${payload}.${tamperedSignature}`),
    null,
  );

  const expired = await issueSession({
    userId: "00000000-0000-4000-8000-000000000001",
    externalUserId: "phone:test-hash",
    now: new Date("2000-01-01T00:00:00.000Z"),
  });
  assert.equal(await verifySessionToken(expired), null);
});

test("same-user Sessions issued in the same second rotate with unpredictable jti values", async () => {
  const input = {
    userId: "00000000-0000-4000-8000-000000000001",
    externalUserId: "phone:test-hash",
    now: new Date("2026-07-25T00:00:00.000Z"),
  };
  const first = await issueSession(input);
  const second = await issueSession(input);
  assert.notEqual(first, second);
  const firstJti = decodeJwt(first).jti;
  const secondJti = decodeJwt(second).jti;
  assert.match(
    firstJti ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.match(
    secondJti ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.notEqual(firstJti, secondJti);
  assert.ok(await verifySessionToken(first));
  assert.ok(await verifySessionToken(second));

  const nowSeconds = Math.floor(Date.now() / 1000);
  const stillValidLegacySession = await signSessionClaims({
    sub: input.userId,
    externalUserId: input.externalUserId,
    iss: "memoryai",
    aud: "memoryai-web",
    iat: nowSeconds,
    exp: nowSeconds + AUTH_POLICY.sessionTtlSeconds,
  });
  assert.ok(await verifySessionToken(stillValidLegacySession));
});

async function signSessionClaims(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(sessionSecret());
}

test("session requires bounded integer iat and exp claims", async (t) => {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    sub: "00000000-0000-4000-8000-000000000001",
    externalUserId: "phone:test-hash",
    iss: "memoryai",
    aud: "memoryai-web",
    iat: now,
    exp: now + AUTH_POLICY.sessionTtlSeconds,
  };
  for (const testCase of [
    { name: "missing iat", claims: { ...base, iat: undefined } },
    { name: "non-integer iat", claims: { ...base, iat: now + 0.5 } },
    {
      name: "future iat beyond tolerance",
      claims: {
        ...base,
        iat: now + AUTH_POLICY.sessionClockToleranceSeconds + 1,
        exp: now + AUTH_POLICY.sessionClockToleranceSeconds + 120,
      },
    },
    { name: "exp equal to iat", claims: { ...base, exp: now } },
    { name: "exp before iat", claims: { ...base, iat: now - 1, exp: now - 2 } },
    {
      name: "session lifetime exceeds policy",
      claims: { ...base, exp: now + AUTH_POLICY.sessionTtlSeconds + 1 },
    },
  ]) {
    await t.test(testCase.name, async () => {
      const claims = Object.fromEntries(
        Object.entries(testCase.claims).filter(([, value]) => value !== undefined),
      );
      assert.equal(await verifySessionToken(await signSessionClaims(claims)), null);
    });
  }
});

test("production start configuration binds port 3000 to loopback only", () => {
  const root = path.resolve(process.cwd());
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const ecosystem = fs.readFileSync(path.join(root, "ecosystem.config.js"), "utf8");
  const deployment = fs.readFileSync(path.join(root, "scripts/safe-deploy.sh"), "utf8");
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

  assert.match(packageJson.scripts.start, /-H 127\.0\.0\.1 -p 3000/);
  assert.doesNotMatch(packageJson.scripts.start, /0\.0\.0\.0/);
  assert.match(ecosystem, /args: "start -H 127\.0\.0\.1 -p 3000"/);
  assert.match(ecosystem, /name: "memoryai"/);
  assert.match(deployment, /ss -H -ltn 'sport = :3000'/);
  assert.match(envExample, /AUTH_TRUST_NGINX_PROXY=false/);
  assert.match(envExample, /AUTH_PROXY_LOOPBACK_ONLY=false/);
  assert.doesNotMatch(envExample, /^AUTH_TRUST_NGINX_PROXY=true$/m);
});
