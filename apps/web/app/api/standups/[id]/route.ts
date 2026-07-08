import { NextResponse } from "next/server";
import { authorizedApiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";
import { standupInputSchema } from "@/app/_lib/validation/standups";
import { standupSchema } from "@/app/_lib/validation/responses";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = standupInputSchema.parse(await request.json());
    const result = await authorizedApiFetch(`/standups/${id}`, {
      method: "PATCH",
      body,
      schema: standupSchema,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toRouteResponse(error);
  }
}

