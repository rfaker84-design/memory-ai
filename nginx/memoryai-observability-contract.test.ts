import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync("nginx/memoryai.conf", "utf8");

test("Nginx API observability is correlatable without logging sensitive request material", () => {
  assert.match(config, /log_format memoryai_api_json escape=json/);
  const logFormat = config.match(/log_format memoryai_api_json escape=json[\s\S]*?;/)?.[0] ?? "";
  for (const variable of [
    "$request_id",
    "$upstream_http_x_request_id",
    "$upstream_status",
    "$request_time",
    "$upstream_response_time",
  ]) assert.ok(logFormat.includes(variable), `${variable} is missing from the API log format`);
  assert.match(config, /location \/api\/ \{[\s\S]*?access_log \/var\/log\/nginx\/memoryai-api\.access\.json memoryai_api_json;/);
  assert.match(config, /location \/api\/ \{[\s\S]*?proxy_set_header X-Nginx-Request-Id \$request_id;/);
  for (const forbidden of ["$request_uri", "$args", "$http_cookie", "$http_authorization", "$request_body"]) {
    assert.ok(!logFormat.includes(forbidden), `${forbidden} must not be in the API log format`);
  }
});
