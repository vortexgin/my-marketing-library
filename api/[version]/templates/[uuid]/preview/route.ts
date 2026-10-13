import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { TemplatePreviewUseCase, type PreviewTemplateInput } from "@/app/marketing/useCases/template/TemplatePreviewUseCase";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json().catch(() => ({}))) as Partial<PreviewTemplateInput>;

    const result = await new TemplatePreviewUseCase().exec(
      uuid,
      { contact_type: payload.contact_type, contact_id: payload.contact_id },
      await actorFromRequest(request),
    );
    return ok(result);
  } catch (error: any) {
    return fail(error.message ?? "Failed to preview template.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:template:view:preview"]);
