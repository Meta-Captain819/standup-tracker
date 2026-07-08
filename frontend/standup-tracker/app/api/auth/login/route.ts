import { NextResponse } from "next/server";
import { loginSchema } from "@/app/_lib/validation/identity";
import { sessionResultSchema } from "@/app/_lib/validation/responses";
import { apiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { createSession } from "@/app/_lib/session/write";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const sessionResult = await apiFetch("/auth/login", {
      method: "POST",
      body,
      schema: sessionResultSchema,
    });

    await createSession(sessionResult);

    return NextResponse.json({ user: sessionResult.user }, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
