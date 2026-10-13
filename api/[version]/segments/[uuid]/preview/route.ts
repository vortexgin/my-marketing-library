import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { SegmentPreviewUseCase } from "@/app/marketing/useCases/segment/SegmentPreviewUseCase";

export const runtime = "nodejs";

async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const result = await new SegmentPreviewUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(result);
  } catch (error: any) {
    return fail(error.message ?? "Failed to preview segment.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:segment:view:preview"]);
