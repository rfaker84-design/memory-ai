import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "../auth-repository";
import { getWeChatAuthCapability, requireWeChatAuthConfig } from "./wechat-auth-config";
import { hashWeChatIdentitySubjects } from "./wechat-auth-crypto";
import { WeChatAuthError } from "./wechat-auth-error";
import {
  WeChatOfficialAuthProvider,
  type WeChatAuthProviderPort,
} from "./wechat-auth-provider";
import type {
  CreateWeChatStateResult,
  ResolveWeChatIdentityResult,
  WeChatAuthRepositoryPort,
} from "./wechat-auth-repository";
import { WeChatAuthService } from "./wechat-auth-service";

const PHONE_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  externalUserId: "phone:synthetic",
  createdAt: "2026-07-25T00:00:00.000Z",
};
const OTHER_USER: AuthUser = {
  id: "00000000-0000-4000-8000-000000000002",
  externalUserId: "wechat:existing",
  createdAt: "2026-07-25T00:00:00.000Z",
};

class MemoryRepository implements WeChatAuthRepositoryPort {
  readonly states = new Map<string, {
    expiresAt: Date;
    consumed: boolean;
  }>();
  readonly users = new Map<string, AuthUser>();
  readonly identities = new Map<string, string>();
  private nextUser = 10;

  constructor(...users: AuthUser[]) {
    for (const user of users) this.users.set(user.id, user);
  }

  seedIdentity(subjectHash: string, user: AuthUser): void {
    this.users.set(user.id, user);
    this.identities.set(subjectHash, user.id);
  }

  async createState(input: {
    stateDigest: string;
    expiresAt: Date;
  }): Promise<CreateWeChatStateResult> {
    if (this.states.has(input.stateDigest)) return "collision";
    this.states.set(input.stateDigest, {
      expiresAt: input.expiresAt,
      consumed: false,
    });
    return "created";
  }

  async consumeState(input: {
    stateDigest: string;
    now: Date;
  }): Promise<boolean> {
    const state = this.states.get(input.stateDigest);
    if (!state || state.consumed || state.expiresAt <= input.now) return false;
    state.consumed = true;
    return true;
  }

  async resolveIdentity(input: {
    primarySubjectHash: string;
    fallbackSubjectHash: string | null;
  }): Promise<ResolveWeChatIdentityResult> {
    const primaryId = this.identities.get(input.primarySubjectHash);
    const fallbackId = input.fallbackSubjectHash
      ? this.identities.get(input.fallbackSubjectHash)
      : undefined;
    if (primaryId) {
      if (fallbackId && fallbackId !== primaryId) return { status: "conflict" };
      return { status: "resolved", user: this.users.get(primaryId)! };
    }
    if (fallbackId) return { status: "conflict" };

    const id = `00000000-0000-4000-8000-${String(this.nextUser++).padStart(12, "0")}`;
    const user: AuthUser = {
      id,
      externalUserId: `wechat:${input.primarySubjectHash}`,
      createdAt: "2026-07-25T00:00:00.000Z",
    };
    this.users.set(id, user);
    this.identities.set(input.primarySubjectHash, id);
    return { status: "resolved", user };
  }
}

class FakeProvider implements WeChatAuthProviderPort {
  readonly appId = "wx1234567890abcdef";
  readonly identityPepper = "wechat-test-pepper-with-at-least-32-bytes";
  exchangeCalls = 0;
  fail = false;
  openId = "stable-open-id";
  unionId: string | null = "stable-union-id";

  authorizationUrl(state: string): string {
    return `https://wechat.test/authorize?state=${state}`;
  }

  async exchangeCode(): Promise<{ openId: string; unionId: string | null }> {
    this.exchangeCalls += 1;
    if (this.fail) throw new WeChatAuthError("WECHAT_AUTH_FAILED");
    return { openId: this.openId, unionId: this.unionId };
  }
}

function sequentialStates(): () => string {
  let counter = 0;
  return () => String(counter++).padStart(43, "a");
}

function stateFrom(result: { authorizationUrl: string }): string {
  return new URL(result.authorizationUrl).searchParams.get("state")!;
}

test("ordinary WeChat login never binds a residual phone Session user", async () => {
  const repository = new MemoryRepository(PHONE_USER);
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );

  const state = stateFrom(await service.begin());
  const loggedIn = await service.complete({ state, code: "first-code" });
  assert.notEqual(loggedIn.id, PHONE_USER.id);
  assert.equal(loggedIn.externalUserId.startsWith("wechat:"), true);
  assert.equal(repository.users.get(PHONE_USER.id)?.externalUserId, PHONE_USER.externalUserId);

  const repeated = await service.complete({
    state: stateFrom(await service.begin()),
    code: "second-code",
  });
  assert.equal(repeated.id, loggedIn.id);
  assert.equal(repository.users.size, 2);
});

test("UnionID is deterministic primary and OpenID fallback is scoped by provider and AppID", () => {
  const common = {
    openId: "same-open-id",
    identityPepper: "wechat-test-pepper-with-at-least-32-bytes",
  };
  const appOne = hashWeChatIdentitySubjects({
    ...common,
    appId: "wx1111111111111111",
    unionId: "stable-union-id",
  });
  const appTwo = hashWeChatIdentitySubjects({
    ...common,
    appId: "wx2222222222222222",
    unionId: "stable-union-id",
  });
  assert.equal(appOne.primarySubjectHash, appTwo.primarySubjectHash);
  assert.notEqual(appOne.fallbackSubjectHash, appTwo.fallbackSubjectHash);

  const fallbackOne = hashWeChatIdentitySubjects({
    ...common,
    appId: "wx1111111111111111",
    unionId: null,
  });
  const fallbackTwo = hashWeChatIdentitySubjects({
    ...common,
    appId: "wx2222222222222222",
    unionId: null,
  });
  assert.equal(fallbackOne.fallbackSubjectHash, null);
  assert.equal(fallbackTwo.fallbackSubjectHash, null);
  assert.notEqual(fallbackOne.primarySubjectHash, fallbackTwo.primarySubjectHash);
  assert.notEqual(appOne.primarySubjectHash, fallbackOne.primarySubjectHash);
  assert.notEqual(
    appOne.primarySubjectHash,
    hashWeChatIdentitySubjects({
      ...common,
      appId: "wx1111111111111111",
      unionId: "stable-union-id",
      identityPepper: "independent-second-pepper-with-at-least-32-bytes",
    }).primarySubjectHash,
  );
});

test("UnionID is stored as primary while simultaneous OpenID is retained only for conflict detection", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );
  const expected = hashWeChatIdentitySubjects({
    appId: provider.appId,
    openId: provider.openId,
    unionId: provider.unionId,
    identityPepper: provider.identityPepper,
  });
  await service.complete({
    state: stateFrom(await service.begin()),
    code: "provider-code",
  });
  assert.equal(repository.identities.has(expected.primarySubjectHash), true);
  assert.equal(repository.identities.has(expected.fallbackSubjectHash!), false);
  assert.equal(repository.identities.size, 1);
});

test("UnionID upgrade and UnionID/OpenID cross-user conflict never merge accounts", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );

  provider.unionId = null;
  const openIdUser = await service.complete({
    state: stateFrom(await service.begin()),
    code: "openid-only",
  });
  provider.unionId = "later-union-id";
  await assert.rejects(
    service.complete({
      state: stateFrom(await service.begin()),
      code: "unsafe-upgrade",
    }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_ACCOUNT_CONFLICT",
  );
  assert.equal(repository.users.size, 1);
  assert.equal([...repository.identities.values()][0], openIdUser.id);

  const hashes = hashWeChatIdentitySubjects({
    appId: provider.appId,
    openId: "conflicting-open-id",
    unionId: "conflicting-union-id",
    identityPepper: provider.identityPepper,
  });
  repository.seedIdentity(hashes.primarySubjectHash, OTHER_USER);
  repository.seedIdentity(hashes.fallbackSubjectHash!, openIdUser);
  provider.openId = "conflicting-open-id";
  provider.unionId = "conflicting-union-id";
  await assert.rejects(
    service.complete({
      state: stateFrom(await service.begin()),
      code: "cross-user-conflict",
    }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_ACCOUNT_CONFLICT",
  );
  assert.equal(repository.identities.get(hashes.primarySubjectHash), OTHER_USER.id);
  assert.equal(repository.identities.get(hashes.fallbackSubjectHash!), openIdUser.id);
});

test("a changed UnionID never reuses the prior subject while a stable UnionID survives OpenID rotation", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );

  const first = await service.complete({
    state: stateFrom(await service.begin()),
    code: "first-union-subject",
  });
  provider.unionId = "changed-union-id";
  const changed = await service.complete({
    state: stateFrom(await service.begin()),
    code: "changed-union-subject",
  });
  assert.notEqual(changed.id, first.id);
  assert.equal(repository.users.size, 2);
  assert.equal(repository.identities.size, 2);

  provider.unionId = "stable-union-id";
  provider.openId = "rotated-open-id";
  const stable = await service.complete({
    state: stateFrom(await service.begin()),
    code: "stable-union-new-openid",
  });
  assert.equal(stable.id, first.id);
  assert.equal(repository.users.size, 2);
  assert.equal(repository.identities.size, 2);
});

test("state replay and concurrent first login reach the provider only once", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );
  const state = stateFrom(await service.begin());
  const results = await Promise.allSettled([
    service.complete({ state, code: "duplicate-code" }),
    service.complete({ state, code: "duplicate-code" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(provider.exchangeCalls, 1);
  assert.equal(repository.users.size, 1);

  await assert.rejects(
    service.complete({ state, code: "code-c" }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_STATE_INVALID",
  );
  assert.equal(provider.exchangeCalls, 1);
});

test("missing and tampered state are rejected before provider exchange without consuming the valid state", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );
  const state = stateFrom(await service.begin());
  for (const invalidState of [
    "",
    state.slice(1),
    `${state.slice(0, -1)}Z`,
  ]) {
    await assert.rejects(
      service.complete({ state: invalidState, code: "must-not-reach-provider" }),
      (error: unknown) => error instanceof WeChatAuthError
        && error.code === "WECHAT_AUTH_STATE_INVALID",
    );
  }
  assert.equal(provider.exchangeCalls, 0);
  await service.complete({ state, code: "valid-after-tamper" });
  assert.equal(provider.exchangeCalls, 1);
  assert.equal(repository.users.size, 1);
});

test("concurrent first logins with independent states resolve one existing identity", async () => {
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    sequentialStates(),
  );
  const firstState = stateFrom(await service.begin());
  const secondState = stateFrom(await service.begin());
  const [first, second] = await Promise.all([
    service.complete({ state: firstState, code: "first-code" }),
    service.complete({ state: secondState, code: "second-code" }),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(provider.exchangeCalls, 2);
  assert.equal(repository.users.size, 1);
  assert.equal(repository.identities.size, 1);
});

test("cancel, expiry, and provider failure consume state without mock success", async () => {
  let now = new Date("2026-07-25T00:00:00.000Z");
  const repository = new MemoryRepository();
  const provider = new FakeProvider();
  const service = new WeChatAuthService(repository, provider, () => now, sequentialStates());

  let state = stateFrom(await service.begin());
  await assert.rejects(
    service.cancel(state),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_CANCELLED",
  );
  await assert.rejects(
    service.complete({ state, code: "after-cancel" }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_STATE_INVALID",
  );

  state = stateFrom(await service.begin());
  now = new Date("2026-07-25T00:05:00.001Z");
  await assert.rejects(
    service.complete({ state, code: "expired" }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_STATE_INVALID",
  );

  now = new Date("2026-07-25T00:06:00.000Z");
  state = stateFrom(await service.begin());
  provider.fail = true;
  await assert.rejects(
    service.complete({ state, code: "provider-fails" }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_FAILED",
  );
  provider.fail = false;
  await assert.rejects(
    service.complete({ state, code: "unsafe-retry" }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_STATE_INVALID",
  );
  assert.equal(repository.users.size, 0);
});

test("OAuth secrets and provider identity originals stop before persistence, return values, and logs", async () => {
  const appSecret = "sensitive-app-secret-value";
  const accessToken = "sensitive-access-token-value";
  const openId = "sensitive-open-id";
  const unionId = "sensitive-union-id";
  const code = "sensitive-oauth-code";
  const rawState = "s".repeat(43);
  let requestedUrl = "";
  let createdState: unknown;
  let persistedIdentity: {
    primarySubjectHash: string;
    fallbackSubjectHash: string | null;
  } | undefined;
  const repository: WeChatAuthRepositoryPort = {
    createState: async (input) => {
      createdState = input;
      return "created";
    },
    consumeState: async () => true,
    resolveIdentity: async (input) => {
      persistedIdentity = input;
      return {
        status: "resolved",
        user: {
          id: "00000000-0000-4000-8000-000000000099",
          externalUserId: `wechat:${input.primarySubjectHash}`,
          createdAt: "2026-07-25T00:00:00.000Z",
        },
      };
    },
  };
  const provider = new WeChatOfficialAuthProvider({
    appId: "wx1234567890abcdef",
    appSecret,
    redirectUri: "https://memoryai.test/api/auth/wechat/callback",
    identityPepper: "wechat-test-pepper-with-at-least-32-bytes",
  }, async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      access_token: accessToken,
      openid: openId,
      unionid: unionId,
    }), { status: 200 });
  });
  const service = new WeChatAuthService(
    repository,
    provider,
    () => new Date("2026-07-25T00:00:00.000Z"),
    () => rawState,
  );
  const messages: string[] = [];
  const original = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const record = (...values: unknown[]) => {
    messages.push(values.map((value) => (
      typeof value === "string" ? value : JSON.stringify(value)
    )).join(" "));
  };
  console.error = record;
  console.info = record;
  console.log = record;
  console.warn = record;
  let user: AuthUser | undefined;
  try {
    const started = await service.begin();
    user = await service.complete({
      state: stateFrom(started),
      code,
    });
  } finally {
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
  }

  const outbound = new URL(requestedUrl);
  assert.equal(outbound.searchParams.get("secret"), appSecret);
  assert.equal(outbound.searchParams.get("code"), code);
  assert.ok(createdState);
  assert.ok(persistedIdentity);
  assert.ok(user);
  assert.deepEqual(
    Object.keys(createdState as Record<string, unknown>).sort(),
    ["expiresAt", "stateDigest"],
  );
  assert.match(persistedIdentity.primarySubjectHash, /^[0-9a-f]{64}$/);
  assert.match(persistedIdentity.fallbackSubjectHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(messages.length, 0);

  const protectedSurfaces = JSON.stringify({
    createdState,
    persistedIdentity,
    returnedUser: user,
    logs: messages,
  });
  for (const sensitive of [
    rawState,
    code,
    accessToken,
    openId,
    unionId,
    appSecret,
  ]) {
    assert.equal(protectedSurfaces.includes(sensitive), false, sensitive);
  }
});

test("capability fails closed and the official provider preserves OpenID plus UnionID", async () => {
  const completeEnvironment = {
    NODE_ENV: "test",
    AUTH_ALLOWED_ORIGIN: "https://memoryai.test",
    WECHAT_AUTH_APP_ID: "wx1234567890abcdef",
    WECHAT_AUTH_APP_SECRET: "server-only-app-secret",
    WECHAT_AUTH_REDIRECT_URI: "https://memoryai.test/api/auth/wechat/callback",
    WECHAT_AUTH_IDENTITY_PEPPER: "wechat-test-pepper-with-at-least-32-bytes",
  } satisfies NodeJS.ProcessEnv;
  assert.deepEqual(getWeChatAuthCapability({ NODE_ENV: "test" }), {
    provider: "wechat",
    available: false,
  });
  assert.deepEqual(getWeChatAuthCapability(completeEnvironment), {
    provider: "wechat",
    available: true,
  });
  assert.throws(
    () => requireWeChatAuthConfig({
      ...completeEnvironment,
      WECHAT_AUTH_REDIRECT_URI: "https://attacker.invalid/api/auth/wechat/callback",
    }),
    (error: unknown) => error instanceof WeChatAuthError
      && error.code === "WECHAT_AUTH_UNAVAILABLE",
  );

  let requestedUrl = "";
  const provider = new WeChatOfficialAuthProvider(
    requireWeChatAuthConfig(completeEnvironment),
    async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        access_token: "not-persisted",
        openid: "provider-open-id",
        unionid: "provider-union-id",
      }), { status: 200 });
    },
  );
  const authorizationUrl = provider.authorizationUrl("safe-state");
  assert.match(authorizationUrl, /^https:\/\/open\.weixin\.qq\.com\/connect\/qrconnect\?/);
  assert.match(authorizationUrl, /scope=snsapi_login/);
  assert.doesNotMatch(authorizationUrl, /server-only-app-secret/);
  assert.deepEqual(await provider.exchangeCode("one-time-code"), {
    openId: "provider-open-id",
    unionId: "provider-union-id",
  });
  const tokenUrl = new URL(requestedUrl);
  assert.equal(tokenUrl.origin, "https://api.weixin.qq.com");
  assert.equal(tokenUrl.pathname, "/sns/oauth2/access_token");
  assert.equal(tokenUrl.searchParams.get("secret"), "server-only-app-secret");
  assert.equal(tokenUrl.searchParams.get("code"), "one-time-code");

  const withoutUnion = new WeChatOfficialAuthProvider(
    requireWeChatAuthConfig(completeEnvironment),
    async () => new Response(JSON.stringify({
      access_token: "not-persisted",
      openid: "provider-open-id",
    }), { status: 200 }),
  );
  assert.deepEqual(await withoutUnion.exchangeCode("fallback-code"), {
    openId: "provider-open-id",
    unionId: null,
  });
});
