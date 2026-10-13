import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CampaignRunTransitionUseCase } from "@/app/marketing/useCases/campaignRun/CampaignRunTransitionUseCase";

export const runtime = "nodejs";

async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CampaignRunTransitionUseCase("pause").exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to pause campaign run.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:campaign:view:pause"]);
