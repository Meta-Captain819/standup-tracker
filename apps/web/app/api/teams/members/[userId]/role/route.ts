import { NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { rosterMemberSchema } from "@/app/_lib/validation/responses";
import { setRoleSchema } from "@/app/_lib/validation/teams";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const body = setRoleSchema.parse(await request.json());
    const result = await authorizedApiFetch(`/teams/members/${userId}/role`, {
      method: "PATCH",
      body,
      schema: rosterMemberSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

