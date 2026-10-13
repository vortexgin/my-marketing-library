import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { ContactPreferenceImportPreviewUseCase } from "@/app/marketing/useCases/contactPreference/ContactPreferenceImportPreviewUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { rows?: unknown };
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const result = await new ContactPreferenceImportPreviewUseCase().exec(
      { rows: (payload.rows ?? []) as Parameters<ContactPreferenceImportPreviewUseCase["exec"]>[0]["rows"] },
      await actorFromRequest(request),
    );
    return ok(result);
  } catch (error: any) {
    return fail(error.message ?? "Failed to preview consent import.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:contact-preference:create:import"]);
