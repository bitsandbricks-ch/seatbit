import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per page: only scripts Next.js renders (which carry the
 * nonce) run, so injected markup can't execute script. Pages are rendered per request anyway (the
 * layout reads the session, language and theme cookies), which nonces need.
 * Styles allow inline: React style attributes and the mail previews use them.
 */
function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Profile pictures come from Discord/Google; mail previews show the instance logo by URL.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Server actions redirect to Stripe and Discord after a form post.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://connect.stripe.com https://discord.com",
    "frame-ancestors 'none'",
    // Only for https instances: a plain-http setup in a home network would break otherwise.
    ...(!dev && process.env.BETTER_AUTH_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const headers = new Headers(request.headers);
  // Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", policy);
  return res;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes, uploads and static files set their own headers (next.config.ts).
      source: "/((?!api/|_next/static|_next/image|clan-avatar/|user-avatar/|favicon.ico|icon.svg|apple-icon.png|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
