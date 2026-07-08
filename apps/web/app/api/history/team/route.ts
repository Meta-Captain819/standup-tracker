import { NextRequest, NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { dateBoardSchema } from "@/app/_lib/validation/responses";
import { calendarDateStringSchema } from "@/app/_lib/validation/calendar";

export async function GET(request: NextRequest) {
  try {
    const date = calendarDateStringSchema.parse(request.nextUrl.searchParams.get("date"));
    const result = await authorizedApiFetch("/history/team", {
      searchParams: { date },
      schema: dateBoardSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

