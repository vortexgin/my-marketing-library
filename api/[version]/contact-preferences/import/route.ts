import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { ContactPreferenceImportUseCase } from "@/app/marketing/useCases/contactPreference/ContactPreferenceImportUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { source?: string; rows?: unknown };
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const result = await new ContactPreferenceImportUseCase().exec(
      {
        source: payload.source,
        rows: (payload.rows ?? []) as Parameters<ContactPreferenceImportUseCase["exec"]>[0]["rows"],
      },
      await actorFromRequest(request),
    );
    return ok(result, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to import consent rows.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["marketing:contact-preference:create:import"]);
