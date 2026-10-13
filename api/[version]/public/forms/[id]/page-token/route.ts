import { NextRequest, NextResponse } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import MarketingFormModelFactory, { MarketingFormModel } from "@/app/marketing/models/MarketingFormModel";
import LandingPageModelFactory, { LandingPageModel } from "@/app/marketing/models/LandingPageModel";
import { signToken } from "@/app/marketing/libraries/publicTokens";
import { checkRateLimit, clientIp } from "@/app/marketing/libraries/rateLimit";

export const runtime = "nodejs";

function envelope(success: boolean, code: number, message: string, data: unknown) {
  return NextResponse.json(
    { success, code, ts: Math.floor(Date.now() / 1000), message, data },
    { status: code },
  );
}

/**
 * Public signed page-context token for inline landing-page forms. Binds a
 * form to the published page it renders on; the submit endpoint verifies
 * the binding before attributing a landing page/campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const limit = checkRateLimit(`pagetoken:${clientIp(request)}`, 120, 60 * 1000);
    if (!limit.allowed) {
      return envelope(false, 429, "Too many requests.", null);
    }

    const { id } = await params;
    const pageUuid = request.nextUrl.searchParams.get("page") ?? "";

    await connectDatabase();
    await MarketingFormModelFactory();
    const form = await MarketingFormModel.findOne({ where: { uuid: id, deleted_at: null } }).catch(() => null);
    if (!form || form.status !== "active") {
      return envelope(false, 404, "Form not available.", null);
    }

    await LandingPageModelFactory();
    const page = await LandingPageModel.findOne({ where: { uuid: pageUuid, deleted_at: null } }).catch(() => null);
    if (!page || page.status !== "published" || (page.organization_id ?? null) !== (form.organization_id ?? null)) {
      return envelope(false, 404, "Page not available.", null);
    }

    let pageToken: string;
    try {
      pageToken = signToken({ purpose: "formpage", form: form.uuid, page: page.uuid, exp: Date.now() + 60 * 60 * 1000 });
    } catch {
      return envelope(false, 500, "Page context is not configured.", null);
    }
    return envelope(true, 200, "", { page_token: pageToken });
  } catch {
    return envelope(false, 500, "Page context failed.", null);
  }
}
