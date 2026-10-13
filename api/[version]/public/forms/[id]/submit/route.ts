import { NextRequest, NextResponse } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { FormSubmitUseCase, type FormSubmitInput } from "@/app/marketing/useCases/form/FormSubmitUseCase";
import { checkRateLimit, clientIp } from "@/app/marketing/libraries/rateLimit";
import { readVisitorId } from "@/app/marketing/libraries/publicTokens";

export const runtime = "nodejs";

function envelope(success: boolean, code: number, message: string, data: unknown) {
  return NextResponse.json(
    { success, code, ts: Math.floor(Date.now() / 1000), message, data },
    { status: code },
  );
}

/**
 * Public lead-capture submit (plaintext by necessity). Per-IP/form rate
 * limited with honeypot + fill-timing + duplicate-window defenses inside
 * the useCase. Responses are generic so callers cannot probe for leads.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const limit = checkRateLimit(`formsubmit:${clientIp(request)}:${id}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) {
      return envelope(false, 429, "Too many requests. Please try again later.", null);
    }

    const payload = (await request.json().catch(() => ({}))) as Partial<FormSubmitInput> & { organization_id?: unknown };
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return envelope(false, 400, "organization_id is not allowed.", null);
    }

    // Visitor association is cookie-optional; the body value is advisory.
    // A signed token is decoded to its short id before being stored.
    const visitorCookie = request.cookies.get("marketing_visitor")?.value ?? null;
    const candidate = payload.visitor_id ?? visitorCookie ?? undefined;
    const visitorId = candidate !== undefined ? (readVisitorId(candidate) ?? candidate) : undefined;

    await connectDatabase();
    const result = await new FormSubmitUseCase().exec(id, {
      values: payload.values,
      company_website: (payload as Record<string, unknown>).company_website as string | undefined,
      rendered_at: payload.rendered_at,
      page_token: payload.page_token,
      ...(visitorId ? { visitor_id: visitorId } : {}),
    });
    return envelope(true, 200, "", result);
  } catch (error: any) {
    const code = typeof error?.code === "number" ? error.code : 500;
    return envelope(false, code, error.message ?? "Submission failed.", null);
  }
}
