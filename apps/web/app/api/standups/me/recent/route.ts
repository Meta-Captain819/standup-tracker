import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { standupSchema } from "@/app/_lib/validation/responses";

export async function GET() {
  try {
    const result = await authorizedApiFetch("/standups/me/recent", {
      schema: z.array(standupSchema),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

