import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { MarketingSettingsGetUseCase } from "@/app/marketing/useCases/setting/MarketingSettingsGetUseCase";
import { MarketingSettingsUpdateUseCase, type UpdateMarketingSettingsInput } from "@/app/marketing/useCases/setting/MarketingSettingsUpdateUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const row = await new MarketingSettingsGetUseCase().exec(undefined, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch marketing settings.", getErrorStatus(error, 500));
  }
}

async function handlePut(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<UpdateMarketingSettingsInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new MarketingSettingsUpdateUseCase().exec(
      payload as UpdateMarketingSettingsInput,
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update marketing settings.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:setting:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:setting:view:update"]);
