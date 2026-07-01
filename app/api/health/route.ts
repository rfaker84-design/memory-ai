export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "MemoryAI",
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}
