import { NextResponse } from "next/server";
import { meResponseSchema } from "@/app/_lib/validation/responses";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";

export async function GET() {
  try {
    const me = await authorizedApiFetch("/auth/me", { schema: meResponseSchema });
    return NextResponse.json(me, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
