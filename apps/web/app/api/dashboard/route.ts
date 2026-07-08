import { NextRequest, NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { boardSchema } from "@/app/_lib/validation/responses";
import { calendarDateStringSchema } from "@/app/_lib/validation/calendar";

export async function GET(request: NextRequest) {
  try {
    const rawDate = request.nextUrl.searchParams.get("date") ?? undefined;
    const date = rawDate ? calendarDateStringSchema.parse(rawDate) : undefined;
    const result = await authorizedApiFetch("/dashboard", {
      searchParams: { date },
      schema: boardSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

