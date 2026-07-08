import { NextResponse, type NextRequest } from "next/server";
import { decryptSession } from "@/app/_lib/session/crypto";
import { SESSION_COOKIE_NAME } from "@/app/_lib/session/constants";

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/history", "/team", "/account"];
const AUTH_ONLY_PATHS = ["/signin", "/start-a-team", "/forgot-password", "/reset-password", "/accept-invite"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? await decryptSession(cookieValue) : null;

  const isProtected = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !session) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (AUTH_ONLY_PATHS.includes(pathname) && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
