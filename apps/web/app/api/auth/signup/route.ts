import { NextResponse } from "next/server";
import { signupSchema } from "@/app/_lib/validation/identity";
import { sessionResultSchema } from "@/app/_lib/validation/responses";
import { apiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { createSession } from "@/app/_lib/session/write";

export async function POST(request: Request) {
  try {
    const body = signupSchema.parse(await request.json());

    const sessionResult = await apiFetch("/auth/signup", {
      method: "POST",
      body,
      schema: sessionResultSchema,
    });

    await createSession(sessionResult, body.timezone);

    return NextResponse.json({ user: sessionResult.user }, { status: 201 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
