import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { TemplateTestUseCase } from "@/app/marketing/useCases/template/TemplateTestUseCase";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as { to?: string };

    const result = await new TemplateTestUseCase().exec(uuid, { to: payload.to as string }, await actorFromRequest(request));
    return ok(result);
  } catch (error: any) {
    return fail(error.message ?? "Failed to send test email.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:template:view:test"]);
