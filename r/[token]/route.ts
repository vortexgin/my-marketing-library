import { NextRequest, NextResponse } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import TrackedLinkModelFactory, { TrackedLinkModel } from "@/app/marketing/models/TrackedLinkModel";
import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import { hashBearerToken, newVisitorId, readVisitorId } from "@/app/marketing/libraries/publicTokens";
import { checkRateLimit, clientIp } from "@/app/marketing/libraries/rateLimit";
import { recordMarketingEvent } from "@/app/marketing/libraries/events";
import { attachTouch } from "@/app/marketing/libraries/attribution";

export const runtime = "nodejs";

/**
 * Public tracked redirect. Validates the opaque bearer token, records a
 * click event, attaches first/last-touch attribution with server-owned
 * UTM values, refreshes the visitor identifier, and redirects to the
 * prevalidated stored destination. The request cannot supply a
 * destination; unsafe schemes and open redirects are impossible.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const limit = checkRateLimit(`redirect:${clientIp(request)}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, code: 429, ts: Math.floor(Date.now() / 1000), message: "Too many requests.", data: null },
      { status: 429 },
    );
  }

  const { token } = await params;
  await connectDatabase();

  await TrackedLinkModelFactory();
  const link = await TrackedLinkModel.findOne({
    where: { token_hash: hashBearerToken(token), deleted_at: null },
  }).catch(() => null);
  if (!link) {
    return NextResponse.json(
      { success: false, code: 404, ts: Math.floor(Date.now() / 1000), message: "Link not found.", data: null },
      { status: 404 },
    );
  }

  const destination = link.destination_url ?? "";
  if (!/^https?:\/\//i.test(destination)) {
    return NextResponse.json(
      { success: false, code: 404, ts: Math.floor(Date.now() / 1000), message: "Link not found.", data: null },
      { status: 404 },
    );
  }

  await CampaignRunModelFactory();
  const run = link.campaign_run_id
    ? await CampaignRunModel.findOne({ where: { uuid: link.campaign_run_id, deleted_at: null } }).catch(() => null)
    : null;
  const utm = ((run?.utm_snapshot ?? {}) as Record<string, unknown>);

  let visitorId = readVisitorId(request.cookies.get("marketing_visitor")?.value);
  let freshVisitor: string | null = null;
  if (!visitorId) {
    try {
      freshVisitor = newVisitorId();
      visitorId = readVisitorId(freshVisitor);
    } catch {
      visitorId = null;
    }
  }

  await recordMarketingEvent({
    organization_id: link.organization_id,
    campaign_id: link.campaign_id,
    campaign_run_id: link.campaign_run_id,
    message_id: link.message_id,
    event_type: "clicked",
    payload_summary: { destination: destination.slice(0, 200) },
  }).catch(() => null);

  await attachTouch({
    organization_id: link.organization_id,
    visitor_id: visitorId,
    campaign_id: link.campaign_id,
    campaign_run_id: link.campaign_run_id,
    source: String(utm.source ?? "email"),
    medium: String(utm.medium ?? "marketing"),
    campaign_value: String(utm.campaign ?? ""),
    touch_event_type: "click",
  }).catch(() => null);

  const response = NextResponse.redirect(destination, 302);
  if (freshVisitor) {
    response.cookies.set("marketing_visitor", freshVisitor, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  return response;
}
