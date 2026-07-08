import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { historyPageSchema } from "@/app/_lib/validation/responses";

const cursorSchema = z.string().optional();

export async function GET(request: NextRequest) {
  try {
    const cursor = cursorSchema.parse(request.nextUrl.searchParams.get("cursor") ?? undefined);
    const result = await authorizedApiFetch("/history/me", {
      searchParams: { cursor },
      schema: historyPageSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

