import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { rosterMemberSchema } from "@/app/_lib/validation/responses";
import { addMemberSchema } from "@/app/_lib/validation/teams";

export async function GET() {
  try {
    const result = await authorizedApiFetch("/teams/members", {
      schema: z.array(rosterMemberSchema),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = addMemberSchema.parse(await request.json());
    const result = await authorizedApiFetch("/teams/members", {
      method: "POST",
      body,
      schema: rosterMemberSchema,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

