import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/app/_lib/validation/identity";
import { okResponseSchema } from "@/app/_lib/validation/responses";
import { apiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";

export async function POST(request: Request) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());

    const result = await apiFetch("/auth/password/forgot", {
      method: "POST",
      body,
      schema: okResponseSchema,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
