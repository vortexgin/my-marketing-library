import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LandingPageGetUseCase } from "@/app/marketing/useCases/landingPage/LandingPageGetUseCase";
import { LandingPageUpdateUseCase, type UpdateLandingPageInput } from "@/app/marketing/useCases/landingPage/LandingPageUpdateUseCase";
import { LandingPageDeleteUseCase } from "@/app/marketing/useCases/landingPage/LandingPagePublishUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LandingPageGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch landing page.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateLandingPageInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new LandingPageUpdateUseCase().exec(uuid, payload as UpdateLandingPageInput, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update landing page.", getErrorStatus(error, 500));
  }
}

async function handleDelete(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LandingPageDeleteUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete landing page.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:landing-page:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:landing-page:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["marketing:landing-page:view:delete"]);
