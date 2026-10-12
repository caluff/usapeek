import { NextResponse, type NextRequest } from "next/server";

import {
  VENDOR_RESET_COOKIE,
  VENDOR_SELLER_COOKIE,
  VENDOR_SESSION_COOKIE,
  VENDOR_VERIFICATION_CODE_COOKIE,
  isJwtExpired,
  packSecret,
  safeRedirectPath,
} from "@/lib/auth-utils";

const secure = process.env.NODE_ENV === "production";
const publicSellerRoutes = [
  "/seller/login",
  "/seller/forgot-password",
  "/seller/reset-password",
  "/seller/verify-email",
  "/seller/no-access",
  "/seller/select-seller",
      "/seller/status",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/seller/reset-password") {
    const token = request.nextUrl.searchParams.get("token");
    if (token) {
      const destination = request.nextUrl.clone();
      const email = destination.searchParams.get("email") ?? undefined;
      destination.searchParams.delete("token");
      destination.searchParams.delete("email");
      const response = NextResponse.redirect(destination);
      response.cookies.set(VENDOR_RESET_COOKIE, packSecret({ token, email }), { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 900 });
      return response;
    }
  }

  if (pathname === "/seller/verify-email") {
    const code = request.nextUrl.searchParams.get("code");
    if (code) {
      const destination = request.nextUrl.clone();
      destination.searchParams.delete("code");
      const response = NextResponse.redirect(destination);
      response.cookies.set(VENDOR_VERIFICATION_CODE_COOKIE, code, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 900 });
      return response;
    }
  }

  const isPublic = publicSellerRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (pathname.startsWith("/seller") && !isPublic) {
    const token = request.cookies.get(VENDOR_SESSION_COOKIE)?.value;
    const next = safeRedirectPath(`${pathname}${search}`, "/seller");
    if (!token || isJwtExpired(token)) {
      const login = new URL("/seller/login", request.url);
      login.searchParams.set("next", next);
      if (token) login.searchParams.set("reason", "expired");
      const response = NextResponse.redirect(login);
      if (token) {
        response.cookies.delete(VENDOR_SESSION_COOKIE);
        response.cookies.delete(VENDOR_SELLER_COOKIE);
      }
      return response;
    }
    if (!request.cookies.get(VENDOR_SELLER_COOKIE)?.value) {
      const select = new URL("/seller/select-seller", request.url);
      select.searchParams.set("next", next);
      return NextResponse.redirect(select);
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ["/seller/:path*"] };
