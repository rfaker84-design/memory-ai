import assert from "node:assert/strict";
import test from "node:test";

import { register } from "@/instrumentation";

import {
  assertProductionAuthConfiguration,
  ProductionAuthConfigurationError,
} from "./production-config";

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://memoryai:password@127.0.0.1:5432/memoryai",
  AUTH_VERIFICATION_PEPPER: "p".repeat(32),
  SESSION_SECRET: "s".repeat(32),
  AUTH_ALLOWED_ORIGIN: "https://memoryai.test",
  AUTH_TRUST_NGINX_PROXY: "true",
  AUTH_PROXY_LOOPBACK_ONLY: "true",
};

test("production startup accepts core authentication configuration without SMS capability variables", () => {
  assert.doesNotThrow(() => assertProductionAuthConfiguration(productionEnvironment));
});

test("production authentication startup configuration fails closed for every required boundary", () => {
  const cases: Array<[string, string]> = [
    ["DATABASE_URL", "DATABASE_URL_NOT_CONFIGURED"],
    ["AUTH_VERIFICATION_PEPPER", "AUTH_VERIFICATION_PEPPER_NOT_CONFIGURED"],
    ["SESSION_SECRET", "SESSION_SECRET_NOT_CONFIGURED"],
    ["AUTH_ALLOWED_ORIGIN", "AUTH_ALLOWED_ORIGIN_NOT_CONFIGURED"],
    ["AUTH_TRUST_NGINX_PROXY", "AUTH_TRUST_NGINX_PROXY_NOT_CONFIGURED"],
    ["AUTH_PROXY_LOOPBACK_ONLY", "AUTH_PROXY_LOOPBACK_CONTRACT_NOT_CONFIGURED"],
  ];

  for (const [name, code] of cases) {
    const environment = { ...productionEnvironment, [name]: "" };
    assert.throws(
      () => assertProductionAuthConfiguration(environment),
      (error: unknown) => error instanceof ProductionAuthConfigurationError && error.code === code,
      name
    );
  }
});

test("production authentication startup configuration rejects weak secrets and unsafe endpoints", () => {
  for (const [name, value, code] of [
    ["AUTH_VERIFICATION_PEPPER", "too-short", "AUTH_VERIFICATION_PEPPER_NOT_CONFIGURED"],
    ["SESSION_SECRET", "too-short", "SESSION_SECRET_NOT_CONFIGURED"],
    ["DATABASE_URL", "mysql://example.test/auth", "DATABASE_URL_INVALID"],
    ["AUTH_ALLOWED_ORIGIN", "http://memoryai.test", "AUTH_ALLOWED_ORIGIN_INVALID"],
  ] as const) {
    const environment = { ...productionEnvironment, [name]: value };
    assert.throws(
      () => assertProductionAuthConfiguration(environment),
      (error: unknown) => error instanceof ProductionAuthConfigurationError && error.code === code,
      name
    );
  }
});

test("non-production configuration does not prevent local development startup", () => {
  assert.doesNotThrow(() => assertProductionAuthConfiguration({ NODE_ENV: "development" }));
});

test("production instrumentation invokes the startup gate before serving requests", async () => {
  const keys = Object.keys(productionEnvironment);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  const previousPhase = process.env.NEXT_PHASE;
  const previousRuntime = process.env.NEXT_RUNTIME;
  try {
    Object.assign(process.env, productionEnvironment);
    delete process.env.SESSION_SECRET;
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "nodejs";
    await assert.rejects(
      register(),
      (error: unknown) => error instanceof ProductionAuthConfigurationError
        && error.code === "SESSION_SECRET_NOT_CONFIGURED"
    );
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previousPhase;
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  }
});
