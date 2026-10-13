import Joi from "joi";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { classifyConsentRows, type ConsentImportRow } from "@/app/marketing/libraries/consentImport";
import BadParameterException from "@/exceptions/BadParameterException";

const importRowSchema = Joi.object({
  email: Joi.string().trim().max(160).required(),
  status: Joi.string().trim().allow("").optional(),
  consent_at: Joi.string().trim().allow("").optional(),
  source: Joi.string().trim().allow("").max(160).optional(),
  evidence: Joi.string().trim().allow("").max(500).optional(),
}).unknown(false);

const previewImportSchema = Joi.object({
  rows: Joi.array().items(importRowSchema).min(1).max(500).required(),
}).unknown(false);

export type ConsentImportPreview = {
  row_count: number;
  valid: number;
  duplicates_in_file: number;
  already_opted_out: number;
  suppressed: number;
  invalid: number;
  skipped: Array<{ index: number; email: string; reason: string }>;
};

export class ContactPreferenceImportPreviewUseCase extends BaseUseCase<{ rows: ConsentImportRow[] }, ConsentImportPreview, { rows: ConsentImportRow[]; organizationId: string | null }> {
  protected async preExec(input: { rows: ConsentImportRow[] }, actor?: ActivityActor): Promise<{ rows: ConsentImportRow[]; organizationId: string | null }> {
    const validated = await this.validate<{ rows: ConsentImportRow[] }>(previewImportSchema, input ?? {});
    if (!validated.rows || validated.rows.length === 0) {
      throw new BadParameterException("At least one import row is required.");
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { rows: validated.rows, organizationId };
  }

  protected async execute(context: { rows: ConsentImportRow[]; organizationId: string | null }): Promise<ConsentImportPreview> {
    const classified = await classifyConsentRows(context.organizationId, context.rows);
    const skipped = classified
      .filter((row) => row.disposition !== "valid")
      .map((row) => ({ index: row.index, email: row.email, reason: row.reason ?? "Skipped." }));
    return {
      row_count: classified.length,
      valid: classified.filter((row) => row.disposition === "valid").length,
      duplicates_in_file: classified.filter((row) => row.disposition === "duplicate_in_file").length,
      already_opted_out: classified.filter((row) => row.disposition === "already_opted_out").length,
      suppressed: classified.filter((row) => row.disposition === "suppressed").length,
      invalid: classified.filter((row) => row.disposition === "invalid").length,
      skipped,
    };
  }
}
