import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CampaignScheduleUseCase } from "@/app/marketing/useCases/campaign/CampaignScheduleUseCase";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as { scheduled_at?: string };

    const row = await new CampaignScheduleUseCase().exec(
      uuid,
      { scheduled_at: payload.scheduled_at as string },
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to schedule campaign.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:campaign:view:schedule"]);
