import Joi from "joi";
import { randomUUID } from "crypto";
import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import ConsentImportBatchModelFactory, { ConsentImportBatchModel } from "@/app/marketing/models/ConsentImportBatchModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
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

const applyImportSchema = Joi.object({
  source: Joi.string().trim().allow("").max(160).optional(),
  rows: Joi.array().items(importRowSchema).min(1).max(500).required(),
}).unknown(false);

export type ConsentImportResult = {
  batch_uuid: string;
  row_count: number;
  created: number;
  updated: number;
  skipped: Array<{ index: number; email: string; reason: string }>;
};

export class ContactPreferenceImportUseCase extends BaseUseCase<{ source?: string; rows: ConsentImportRow[] }, ConsentImportResult, { source: string; rows: ConsentImportRow[]; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: { source?: string; rows: ConsentImportRow[] }, actor?: ActivityActor): Promise<{ source: string; rows: ConsentImportRow[]; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<{ source?: string; rows: ConsentImportRow[] }>(applyImportSchema, input ?? {});
    if (!validated.rows || validated.rows.length === 0) {
      throw new BadParameterException("At least one import row is required.");
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { source: validated.source?.trim() || "import", rows: validated.rows, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { source: string; rows: ConsentImportRow[]; actor: ActivityActor; organizationId: string | null }): Promise<ConsentImportResult> {
    const { source, rows, actor, organizationId } = context;
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const classified = await classifyConsentRows(organizationId, rows);

    await ContactPreferenceModelFactory();
    await ConsentImportBatchModelFactory();

    let created = 0;
    let updated = 0;
    const skipped: Array<{ index: number; email: string; reason: string }> = [];

    // Rows apply independently: one bad/conflicting row never fails the batch.
    for (const row of classified) {
      if (row.disposition !== "valid") {
        skipped.push({ index: row.index, email: row.email, reason: row.reason ?? "Skipped." });
        continue;
      }
      try {
        const existing = await ContactPreferenceModel.findOne({
          where: { organization_id: organizationId, normalized_email: row.normalized, deleted_at: null },
        });
        if (existing) {
          await existing.update({
            status: row.status,
            consent_source: "import",
            consent_at: row.consentAt ?? existing.consent_at,
            consent_evidence: row.evidence ?? existing.consent_evidence,
            unsubscribed_at: row.status === "opted_out" ? new Date() : null,
            updated_by: typeof actorUuid === "string" ? actorUuid : null,
            updated_at: new Date(),
          });
          updated += 1;
        } else {
          await ContactPreferenceModel.create({
            uuid: randomUUID(),
            organization_id: organizationId ?? null,
            normalized_email: row.normalized,
            status: row.status,
            consent_source: "import",
            consent_at: row.consentAt,
            consent_evidence: row.evidence,
            unsubscribed_at: row.status === "opted_out" ? new Date() : null,
            created_by: typeof actorUuid === "string" ? actorUuid : null,
            deleted_at: null,
          });
          created += 1;
        }
      } catch {
        skipped.push({ index: row.index, email: row.email, reason: "Row could not be applied." });
      }
    }

    const batch = await ConsentImportBatchModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      imported_by: typeof actorUuid === "string" ? actorUuid : null,
      source,
      row_count: classified.length,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped.length,
      status: "completed",
      deleted_at: null,
    });

    void recordActivityLog({
      actor: actor ?? null,
      operation: "create",
      entity: "marketing_consent_import_batch",
      entity_uuid: batch.uuid,
      origin: null,
      updated: { uuid: batch.uuid, source, row_count: classified.length, created, updated } as unknown as Record<string, unknown>,
    });

    return { batch_uuid: batch.uuid, row_count: classified.length, created, updated, skipped };
  }
}
