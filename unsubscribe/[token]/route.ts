import { NextRequest, NextResponse } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { verifyToken } from "@/app/marketing/libraries/publicTokens";
import { ContactPreferenceUnsubscribeUseCase } from "@/app/marketing/useCases/contactPreference/ContactPreferenceUnsubscribeUseCase";
import { checkRateLimit, clientIp } from "@/app/marketing/libraries/rateLimit";

export const runtime = "nodejs";

function envelope(success: boolean, code: number, message: string, data: unknown) {
  return NextResponse.json(
    { success, code, ts: Math.floor(Date.now() / 1000), message, data },
    { status: code },
  );
}

function confirmationHtml(valid: boolean): NextResponse {
  // Standalone confirmation markup (no app shell): the public route serves
  // both GET (this page) and POST (JSON) from one handler because Next.js
  // forbids colocating page.tsx with route.ts.
  const body = valid
    ? `<p>Stop marketing emails to this address. Transactional emails are unaffected.</p>
       <form method="POST">
         <button type="submit">Unsubscribe me</button>
       </form>`
    : `<p role="status">This link is invalid or expired. If you expected marketing emails, contact the sender instead.</p>`;
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribe | VortexGin</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;"><h1>Unsubscribe.</h1>${body}</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** GET displays the confirmation; invalid tokens render the safe page. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyToken<{ org?: string | null; email?: string }>(token, "unsub", 365 * 24 * 3600 * 1000);
  return confirmationHtml(!!payload?.email);
}

/** POST performs the idempotent opt-out behind the signed token. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const limit = checkRateLimit(`unsub:${clientIp(request)}`, 10, 60 * 1000);
    if (!limit.allowed) {
      return envelope(false, 429, "Too many requests.", null);
    }

    const { token } = await params;
    const payload = verifyToken<{ org?: string | null; email?: string }>(token, "unsub", 365 * 24 * 3600 * 1000);
    if (!payload?.email) {
      return envelope(false, 400, "This link is invalid or expired.", null);
    }

    await connectDatabase();
    const result = await new ContactPreferenceUnsubscribeUseCase().exec({
      organization_id: payload.org ?? null,
      email: payload.email,
    });
    return envelope(true, 200, "", result);
  } catch (error: any) {
    return envelope(false, 500, error.message ?? "Unsubscribe failed.", null);
  }
}
