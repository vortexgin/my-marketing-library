import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { ReportsCampaignUseCase } from "@/app/marketing/useCases/report/ReportsCampaignUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    // Reuses the filter[*] envelope; report keys map onto the filter object.
    const filter: Record<string, string> = collectFilters(params);
    void queryParam(params, "sortProperty");
    const rows = await new ReportsCampaignUseCase().exec({ filter }, await actorFromRequest(request));
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to build campaign report.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:report:list:list"]);
