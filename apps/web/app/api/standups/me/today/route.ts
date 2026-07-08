import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { standupSchema } from "@/app/_lib/validation/responses";
import { timezoneSchema } from "@/app/_lib/validation/timezones";

const responseSchema = standupSchema.nullable();

export async function GET(request: NextRequest) {
  try {
    const timezone = timezoneSchema.parse(request.nextUrl.searchParams.get("timezone"));
    const result = await authorizedApiFetch("/standups/me/today", {
      searchParams: { timezone },
      schema: responseSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return toRouteResponse(error);
    return toRouteResponse(error);
  }
}

