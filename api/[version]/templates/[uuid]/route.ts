import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { TemplateGetUseCase } from "@/app/marketing/useCases/template/TemplateGetUseCase";
import { TemplateUpdateUseCase, type UpdateTemplateInput } from "@/app/marketing/useCases/template/TemplateUpdateUseCase";
import { TemplateDeleteUseCase } from "@/app/marketing/useCases/template/TemplateDeleteUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new TemplateGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch template.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateTemplateInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new TemplateUpdateUseCase().exec(uuid, payload as UpdateTemplateInput, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update template.", getErrorStatus(error, 500));
  }
}

async function handleDelete(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new TemplateDeleteUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete template.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:template:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:template:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["marketing:template:view:delete"]);
