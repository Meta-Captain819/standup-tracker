import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/app/_lib/validation/identity";
import { apiFetch } from "@/app/_lib/api/http";
import { toRouteResponse } from "@/app/_lib/api/errors";

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());

    await apiFetch("/auth/password/reset", { method: "POST", body });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toRouteResponse(error);
  }
}
