import assert from "node:assert/strict";
import test from "node:test";

import { observabilityRoute } from "./api-request-events";

test("API observability uses stable route templates and never logs dynamic identifiers", () => {
  const cases = [
    ["/api/memories/00000000-0000-4000-8000-000000000001/video-shares/11111111-1111-4111-8111-111111111111", "/api/memories/:memoryId/video-shares/:publicId"],
    ["/api/memories/00000000-0000-4000-8000-000000000001/video-shares", "/api/memories/:memoryId/video-shares"],
    ["/api/video-shares/11111111-1111-4111-8111-111111111111/playback", "/api/video-shares/:publicId/playback"],
    ["/api/video-shares/11111111-1111-4111-8111-111111111111", "/api/video-shares/:publicId"],
    ["/api/memories/00000000-0000-4000-8000-000000000001", "/api/memories/:memoryId"],
    ["/api/memories/00000000-0000-4000-8000-000000000001/first-presence-video/00000000-0000-4000-8000-000000000002/playback", "/api/memories/:memoryId/first-presence-video/:jobId/playback"],
    ["/api/memories/00000000-0000-4000-8000-000000000001/first-presence-video/00000000-0000-4000-8000-000000000002/encounter-playback", "/api/memories/:memoryId/first-presence-video/:jobId/encounter-playback"],
    ["/api/memories/00000000-0000-4000-8000-000000000001/pickup-photo-sources", "/api/memories/:memoryId/pickup-photo-sources"],
    ["/api/first-presence-video/playback/signed-provider-token", "/api/first-presence-video/playback/:token"],
  ] as const;

  for (const [pathname, expected] of cases) {
    const route = observabilityRoute(pathname);
    assert.equal(route, expected);
    assert.doesNotMatch(route, /00000000|signed-provider-token/);
  }
  assert.equal(observabilityRoute("/api/health"), "/api/health");
  assert.equal(
    observabilityRoute("/api/legacy/alice@example.test/signed-provider-token"),
    "/api/:unknown",
  );
});
