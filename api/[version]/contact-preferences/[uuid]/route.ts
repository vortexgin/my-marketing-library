import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { ContactPreferenceUpdateUseCase, type UpdateContactPreferenceInput } from "@/app/marketing/useCases/contactPreference/ContactPreferenceUpdateUseCase";

export const runtime = "nodejs";

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<UpdateContactPreferenceInput>;
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new ContactPreferenceUpdateUseCase().exec(
      uuid,
      { status: payload.status as "opted_in" | "opted_out", consent_evidence: payload.consent_evidence ?? null },
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update contact preference.", getErrorStatus(error, 500));
  }
}

export const PUT = withAuthorization(handlePut, ["marketing:contact-preference:view:update"]);
