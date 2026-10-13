import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CampaignGetUseCase } from "@/app/marketing/useCases/campaign/CampaignGetUseCase";
import { CampaignUpdateUseCase, type UpdateCampaignInput } from "@/app/marketing/useCases/campaign/CampaignUpdateUseCase";
import { CampaignDeleteUseCase } from "@/app/marketing/useCases/campaign/CampaignDeleteUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CampaignGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch campaign.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateCampaignInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new CampaignUpdateUseCase().exec(uuid, payload as UpdateCampaignInput, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update campaign.", getErrorStatus(error, 500));
  }
}

async function handleDelete(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CampaignDeleteUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete campaign.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:campaign:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:campaign:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["marketing:campaign:view:delete"]);
