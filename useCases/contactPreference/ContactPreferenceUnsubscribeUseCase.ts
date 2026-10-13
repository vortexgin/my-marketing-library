import { randomUUID } from "crypto";
import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import { recordMarketingEvent } from "@/app/marketing/libraries/events";
import { recordActivityLog } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";

export type UnsubscribeResult = {
  unsubscribed: boolean;
  already: boolean;
};

/**
 * Idempotent public opt-out for a verified (organization, email) pair.
 * Suppressed addresses stay suppressed; the outcome never reveals whether
 * the address previously existed.
 */
export class ContactPreferenceUnsubscribeUseCase extends BaseUseCase<{ organization_id: string | null; email: string }, UnsubscribeResult, { organization_id: string | null; email: string }> {
  protected async preExec(input: { organization_id: string | null; email: string }): Promise<{ organization_id: string | null; email: string }> {
    if (!input || typeof input.email !== "string" || input.email.trim() === "") {
      throw new BadParameterException("Invalid unsubscribe request.");
    }
    return { organization_id: input.organization_id ?? null, email: input.email.trim().toLowerCase() };
  }

  protected async execute(context: { organization_id: string | null; email: string }): Promise<UnsubscribeResult> {
    const { organization_id, email } = context;

    await ContactPreferenceModelFactory();
    const existing = await ContactPreferenceModel.findOne({
      where: { organization_id, normalized_email: email, deleted_at: null },
    });
    let preferenceUuid: string;
    if (existing) {
      if (existing.status === "opted_out" || existing.status === "suppressed") {
        return { unsubscribed: true, already: true };
      }
      preferenceUuid = existing.uuid;
      await existing.update({ status: "opted_out", unsubscribed_at: new Date(), updated_at: new Date() });
    } else {
      preferenceUuid = randomUUID();
      await ContactPreferenceModel.create({
        uuid: preferenceUuid,
        organization_id,
        normalized_email: email,
        status: "opted_out",
        consent_source: "system",
        unsubscribed_at: new Date(),
        deleted_at: null,
      });
    }

    await recordMarketingEvent({
      organization_id,
      event_type: "unsubscribed",
      email,
      payload_summary: { channel: "unsubscribe_page" },
    });

    void recordActivityLog({
      actor: null,
      operation: "update",
      entity: "marketing_contact_preference",
      entity_uuid: preferenceUuid,
      origin: null,
      updated: { normalized_email: email, status: "opted_out" } as unknown as Record<string, unknown>,
    });

    return { unsubscribed: true, already: false };
  }
}
