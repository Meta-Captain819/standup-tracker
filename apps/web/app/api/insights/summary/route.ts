import { NextRequest, NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { daySummarySchema } from "@/app/_lib/validation/responses";
import { calendarDateStringSchema } from "@/app/_lib/validation/calendar";

export async function GET(request: NextRequest) {
  try {
    const standupDate = calendarDateStringSchema.parse(request.nextUrl.searchParams.get("standupDate"));
    const result = await authorizedApiFetch("/insights/summary", {
      searchParams: { standupDate },
      schema: daySummarySchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = { standupDate: calendarDateStringSchema.parse((await request.json()).standupDate) };
    const result = await authorizedApiFetch("/insights/summary/refresh", {
      method: "POST",
      body,
      schema: daySummarySchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

