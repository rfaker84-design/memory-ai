import { supabase } from "@/src/lib/supabase";

export async function GET() {
  try {
    const { error } = await supabase
      .from("memories")
      .select("id")
      .limit(1);

    if (error) {
      return Response.json(
        {
          status: "error",
          message: error.message,
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        status: "ok",
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown database health check error",
      },
      { status: 500 }
    );
  }
}
