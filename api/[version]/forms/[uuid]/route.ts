import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { FormGetUseCase } from "@/app/marketing/useCases/form/FormGetUseCase";
import { FormUpdateUseCase, type UpdateFormInput } from "@/app/marketing/useCases/form/FormUpdateUseCase";
import { FormDeleteUseCase } from "@/app/marketing/useCases/form/FormDeleteUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new FormGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch form.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateFormInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new FormUpdateUseCase().exec(uuid, payload as UpdateFormInput, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update form.", getErrorStatus(error, 500));
  }
}

async function handleDelete(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new FormDeleteUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete form.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["marketing:form:view:detail"]);
export const PUT = withAuthorization(handlePut, ["marketing:form:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["marketing:form:view:delete"]);
