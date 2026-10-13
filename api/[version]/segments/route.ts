import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { SegmentListUseCase } from "@/app/marketing/useCases/segment/SegmentListUseCase";
import { SegmentCreateUseCase, type CreateSegmentInput } from "@/app/marketing/useCases/segment/SegmentCreateUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new SegmentListUseCase().exec(
      {
        filter: collectFilters(params),
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch segments.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateSegmentInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new SegmentCreateUseCase().exec(payload as CreateSegmentInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create segment.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:segment:list:list"]);
export const POST = withAuthorization(handlePost, ["marketing:segment:create:create"]);
