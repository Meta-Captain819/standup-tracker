import { NextResponse } from "next/server";
import { env } from "@/app/_lib/env";
import { getSession } from "@/app/_lib/session/read";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: "SESSION_EXPIRED", message: "Session expired.", retryable: false } },
      { status: 401 },
    );
  }

  const upstream = await fetch(new URL("/realtime/stream", env.BACKEND_API_URL), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: { code: "STREAM_UNAVAILABLE", message: "Live updates are unavailable.", retryable: true } },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

