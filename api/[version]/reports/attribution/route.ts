import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok } from "@/libraries/Http";
import { ReportsAttributionUseCase } from "@/app/marketing/useCases/report/ReportsAttributionUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new ReportsAttributionUseCase().exec(
      { filter: collectFilters(params) },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to build attribution report.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:report:list:list"]);
