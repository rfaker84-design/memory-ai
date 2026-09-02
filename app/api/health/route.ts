export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "MemoryAI",
      sourceSha: process.env.MEMORYAI_RELEASE_SOURCE_SHA ?? null,
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}
