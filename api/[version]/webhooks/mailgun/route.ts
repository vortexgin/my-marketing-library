import { NextRequest, NextResponse } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { fail } from "@/libraries/Http";
import { verifyMailgunWebhook } from "@/libraries/mail";
import { MailgunWebhookUseCase } from "@/app/marketing/useCases/webhook/MailgunWebhookUseCase";
import { checkRateLimit, clientIp } from "@/app/marketing/libraries/rateLimit";

export const runtime = "nodejs";

/**
 * Public Mailgun webhook (plaintext by transport necessity). Verifies the
 * timestamp/token/signature triple and enforces a short replay window;
 * invalid signatures fail closed with 403.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = checkRateLimit(`webhook:${clientIp(request)}`, 300, 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, code: 429, ts: Math.floor(Date.now() / 1000), message: "Too many requests.", data: null },
        { status: 429 },
      );
    }

    const form = await request.formData().catch(() => null);
    const get = (key: string): string => String(form?.get(key) ?? "");
    const timestamp = get("timestamp");
    const token = get("token");
    const signature = get("signature");
    if (!timestamp || !token || !signature || !verifyMailgunWebhook({ timestamp, token, signature })) {
      return NextResponse.json(
        { success: false, code: 403, ts: Math.floor(Date.now() / 1000), message: "Invalid webhook signature.", data: null },
        { status: 403 },
      );
    }

    // Mailgun nests event data under signature + message-headers keys.
    let eventData: Record<string, unknown> = {};
    try {
      eventData = JSON.parse(get("event-data") || "{}") as Record<string, unknown>;
    } catch {
      eventData = {};
    }
    const message = (eventData.message ?? {}) as Record<string, unknown>;
    const headers = (message.headers ?? {}) as Record<string, unknown>;

    await connectDatabase();
    const event = String((eventData.event ?? get("event") ?? "") as string);
    const result = await new MailgunWebhookUseCase().exec({
      timestamp,
      token,
      signature,
      event,
      provider_event_id: typeof eventData.id === "string" ? eventData.id : undefined,
      provider_message_id:
        typeof headers["message-id"] === "string"
          ? (headers["message-id"] as string)
          : typeof message["message-id"] === "string"
            ? (message["message-id"] as string)
            : get("Message-Id") || undefined,
      recipient: typeof eventData.recipient === "string" ? (eventData.recipient as string) : get("recipient") || undefined,
    });

    return NextResponse.json(
      { success: true, code: 200, ts: Math.floor(Date.now() / 1000), message: "", data: result },
      { status: 200 },
    );
  } catch (error: any) {
    return fail(error.message ?? "Webhook processing failed.", 500);
  }
}
