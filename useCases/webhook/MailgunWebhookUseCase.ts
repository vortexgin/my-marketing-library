import { randomUUID } from "crypto";
import MessageModelFactory, { MessageModel, type MessageStatus } from "@/app/marketing/models/MessageModel";
import CampaignMemberModelFactory, { CampaignMemberModel } from "@/app/marketing/models/CampaignMemberModel";
import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import ContactPreferenceModelFactory, { ContactPreferenceModel } from "@/app/marketing/models/ContactPreferenceModel";
import { normalizeEmail } from "@/app/marketing/libraries/email";
import { recordMarketingEvent } from "@/app/marketing/libraries/events";
import { maybeCompleteRun } from "@/app/marketing/libraries/runLifecycle";
import { recordActivityLog } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";

export type MailgunWebhookPayload = {
  timestamp: string;
  token: string;
  signature: string;
  event?: string;
  provider_event_id?: string;
  provider_message_id?: string;
  recipient?: string;
};

const HANDLED_EVENTS = new Set([
  "accepted",
  "delivered",
  "opened",
  "clicked",
  "temporary_fail",
  "permanent_fail",
  "complained",
  "unsubscribed",
]);

/** Forward-only message state ranks: events never regress terminal states. */
const STATE_RANK: Record<string, number> = {
  queued: 0,
  processing: 1,
  accepted: 2,
  delivered: 3,
  soft_bounced: 3,
  hard_bounced: 4,
  complained: 4,
  failed: 4,
  cancelled: 5,
};

async function upsertSuppression(organizationId: string | null, email: string, reason: string): Promise<void> {
  await ContactPreferenceModelFactory();
  const existing = await ContactPreferenceModel.findOne({
    where: { organization_id: organizationId, normalized_email: email, deleted_at: null },
  });
  if (existing) {
    await existing.update({
      status: "suppressed",
      suppression_reason: reason.slice(0, 500),
      unsubscribed_at: new Date(),
      updated_at: new Date(),
    });
    return;
  }
  await ContactPreferenceModel.create({
    uuid: randomUUID(),
    organization_id: organizationId,
    normalized_email: email,
    status: "suppressed",
    consent_source: "system",
    suppression_reason: reason.slice(0, 500),
    unsubscribed_at: new Date(),
    deleted_at: null,
  });
}

async function upsertOptOut(organizationId: string | null, email: string): Promise<void> {
  await ContactPreferenceModelFactory();
  const existing = await ContactPreferenceModel.findOne({
    where: { organization_id: organizationId, normalized_email: email, deleted_at: null },
  });
  if (existing) {
    if (existing.status === "suppressed") {
      return;
    }
    await existing.update({ status: "opted_out", unsubscribed_at: new Date(), updated_at: new Date() });
    return;
  }
  await ContactPreferenceModel.create({
    uuid: randomUUID(),
    organization_id: organizationId,
    normalized_email: email,
    status: "opted_out",
    consent_source: "system",
    unsubscribed_at: new Date(),
    deleted_at: null,
  });
}

export type MailgunWebhookResult = {
  handled: boolean;
  duplicate: boolean;
  event_type: string;
};

/**
 * Verified Mailgun webhook reducer. Signature + timestamp window are
 * checked by the route; this useCase resolves the stored message/run
 * organization (never trusts payload org fields), records idempotent
 * events, advances message/member states forward-only, and upserts
 * suppression on hard bounce/complaint/unsubscribe.
 */
export class MailgunWebhookUseCase extends BaseUseCase<MailgunWebhookPayload, MailgunWebhookResult, MailgunWebhookPayload> {
  protected async preExec(input: MailgunWebhookPayload): Promise<MailgunWebhookPayload> {
    if (!input || typeof input !== "object" || !input.event || !input.provider_message_id) {
      throw new BadParameterException("Malformed webhook payload.");
    }
    return input;
  }

  protected async execute(context: MailgunWebhookPayload): Promise<MailgunWebhookResult> {
    const event = String(context.event);
    if (!HANDLED_EVENTS.has(event)) {
      return { handled: false, duplicate: false, event_type: event };
    }

    await MessageModelFactory();
    const message = await MessageModel.findOne({
      where: { provider_message_id: String(context.provider_message_id), deleted_at: null },
    });

    // Unknown provider message: record an org-less event for forensics and stop.
    if (!message) {
      await recordMarketingEvent({
        organization_id: null,
        event_type: event,
        provider_event_id: context.provider_event_id,
        email: context.recipient,
        payload_summary: { unknown_provider_message: true },
      });
      return { handled: false, duplicate: false, event_type: event };
    }

    await CampaignRunModelFactory();
    const run = await CampaignRunModel.findOne({ where: { uuid: message.campaign_run_id, deleted_at: null } });
    const organizationId = message.organization_id;

    await CampaignMemberModelFactory();
    const memberForEmail = await CampaignMemberModel.findOne({
      where: { uuid: message.campaign_member_id, deleted_at: null },
    }).catch(() => null);
    const email = normalizeEmail(context.recipient) ?? memberForEmail?.email_snapshot ?? null;

    const recorded = await recordMarketingEvent({
      organization_id: organizationId,
      campaign_id: run?.campaign_id ?? null,
      campaign_run_id: message.campaign_run_id,
      message_id: message.uuid,
      provider_event_id: context.provider_event_id,
      event_type: event,
      email,
      payload_summary: {},
    });
    if (recorded.duplicate) {
      return { handled: true, duplicate: true, event_type: event };
    }

    const advance = async (status: MessageStatus): Promise<void> => {
      const current = (message.status ?? "queued") as string;
      if ((STATE_RANK[status] ?? 0) <= (STATE_RANK[current] ?? 0)) {
        return;
      }
      const patch: Record<string, unknown> = { status, updated_at: new Date() };
      if (status === "delivered") {
        patch.delivered_at = new Date();
      }
      await message.update(patch);

      await CampaignMemberModelFactory();
      const member = await CampaignMemberModel.findOne({ where: { uuid: message.campaign_member_id, deleted_at: null } });
      if (member) {
        if (status === "delivered") {
          await member.update({ status: "delivered", updated_at: new Date() });
        } else if (status === "hard_bounced" || status === "complained" || status === "failed") {
          await member.update({ status: "failed", updated_at: new Date() });
        } else if (status === "accepted") {
          await member.update({ status: "accepted", updated_at: new Date() });
        }
      }
    };

    switch (event) {
      case "accepted":
        await advance("accepted");
        break;
      case "delivered":
        await advance("delivered");
        break;
      case "opened":
      case "clicked":
        // Engagement only; message/member delivery state is untouched.
        break;
      case "temporary_fail":
        await advance("soft_bounced");
        break;
      case "permanent_fail":
        await advance("hard_bounced");
        if (email) {
          await upsertSuppression(organizationId, email, "Mailgun hard bounce.");
        }
        break;
      case "complained":
        await advance("complained");
        if (email) {
          await upsertSuppression(organizationId, email, "Mailgun spam complaint.");
        }
        break;
      case "unsubscribed":
        if (email) {
          await upsertOptOut(organizationId, email);
        }
        break;
      default:
        break;
    }

    await maybeCompleteRun(message.campaign_run_id);

    void recordActivityLog({
      actor: null,
      operation: "create",
      entity: "marketing_event",
      entity_uuid: recorded.uuid,
      origin: null,
      updated: { event_type: event, message_id: message.uuid } as unknown as Record<string, unknown>,
    });

    return { handled: true, duplicate: false, event_type: event };
  }
}
