import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CampaignStartRunUseCase } from "@/app/marketing/useCases/campaign/CampaignStartRunUseCase";

export const runtime = "nodejs";

async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const result = await new CampaignStartRunUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(result, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to start campaign run.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:campaign:view:send"]);
