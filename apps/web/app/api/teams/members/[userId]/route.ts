import { NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    await authorizedApiFetch(`/teams/members/${userId}`, { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

