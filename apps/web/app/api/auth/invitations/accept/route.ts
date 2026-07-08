import { NextResponse } from "next/server";
import { acceptInviteSchema } from "@/app/_lib/validation/identity";
import { acceptInviteResponseSchema } from "@/app/_lib/validation/responses";
import { apiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";

export async function POST(request: Request) {
  try {
    const body = acceptInviteSchema.parse(await request.json());

    const result = await apiFetch("/auth/invitations/accept", {
      method: "POST",
      body,
      schema: acceptInviteResponseSchema,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
