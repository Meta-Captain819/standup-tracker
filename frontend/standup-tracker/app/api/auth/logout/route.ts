import { NextResponse } from "next/server";
import { apiFetch } from "@/app/_lib/api/http";
import { getSession } from "@/app/_lib/session/read";
import { destroySession } from "@/app/_lib/session/write";

export async function POST() {
  const session = await getSession();

  if (session) {
    // Best-effort — the local session is destroyed regardless of whether Express's own
    // revocation call succeeds, so a logout never leaves the user stuck signed in.
    await apiFetch("/auth/logout", {
      method: "POST",
      body: { refreshToken: session.refreshToken },
    }).catch(() => undefined);
  }

  await destroySession();

  return new NextResponse(null, { status: 204 });
}
