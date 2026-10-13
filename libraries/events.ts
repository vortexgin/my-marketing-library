import { randomUUID } from "crypto";
import MarketingEventModelFactory, { MarketingEventModel } from "@/app/marketing/models/MarketingEventModel";
import { normalizeEmail } from "@/app/marketing/libraries/email";

export type MarketingEventInput = {
  organization_id: string | null;
  campaign_id?: string | null;
  campaign_run_id?: string | null;
  message_id?: string | null;
  provider_event_id?: string | null;
  event_type: string;
  email?: string | null;
  payload_summary?: Record<string, unknown>;
};

/**
 * Appends an engagement/provider event. Provider duplicates (same
 * provider_event_id) resolve to the existing row — webhook replay safe.
 */
export async function recordMarketingEvent(input: MarketingEventInput): Promise<{ uuid: string; duplicate: boolean }> {
  await MarketingEventModelFactory();

  if (input.provider_event_id) {
    const existing = await MarketingEventModel.findOne({
      where: { provider_event_id: input.provider_event_id, deleted_at: null },
    }).catch(() => null);
    if (existing) {
      return { uuid: existing.uuid, duplicate: true };
    }
  }

  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.payload_summary ?? {})) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      summary[key] = typeof value === "string" ? value.slice(0, 200) : value;
    }
  }

  const row = await MarketingEventModel.create({
    uuid: randomUUID(),
    organization_id: input.organization_id,
    campaign_id: input.campaign_id ?? null,
    campaign_run_id: input.campaign_run_id ?? null,
    message_id: input.message_id ?? null,
    provider_event_id: input.provider_event_id ?? null,
    event_type: input.event_type.slice(0, 60),
    normalized_email: normalizeEmail(input.email),
    payload_summary: summary,
    deleted_at: null,
  }).catch(async (error: unknown) => {
    // Lost an insert race on the provider-event unique index: re-read.
    if (input.provider_event_id) {
      const winner = await MarketingEventModel.findOne({
        where: { provider_event_id: input.provider_event_id, deleted_at: null },
      }).catch(() => null);
      if (winner) {
        return winner;
      }
    }
    throw error;
  });

  return { uuid: row.uuid, duplicate: false };
}
