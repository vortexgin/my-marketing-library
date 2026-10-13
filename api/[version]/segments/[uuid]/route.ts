import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { SegmentGetUseCase } from "@/app/marketing/useCases/segment/SegmentGetUseCase";
import { SegmentUpdateUseCase, type UpdateSegmentInput } from "@/app/marketing/useCases/segment/SegmentUpdateUseCase";
import { SegmentDeleteUseCase } from "@/app/marketing/useCases/segment/SegmentDeleteUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new SegmentGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch segment.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateSegmentInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new SegmentUpdateUseCase().exec(uuid, payload as UpdateSegmentInput, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update segment.", getErrorStatus(error, 500));
  }
}

async function handleDelete(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new SegmentDeleteUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete segment.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:segment:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:segment:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["marketing:segment:view:delete"]);
