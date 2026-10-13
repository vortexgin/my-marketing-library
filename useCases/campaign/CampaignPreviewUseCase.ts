import CampaignModelFactory, { CampaignModel } from "@/app/marketing/models/CampaignModel";
import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { resolveSegmentAudience, type AudienceCounts } from "@/app/marketing/libraries/segmentAudience";
import { checkTransaction } from "@/useCases/TransactionUseCase";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import ForbiddenException from "@/exceptions/ForbiddenException";
import Joi from "joi";

export type CampaignPreview = AudienceCounts & {
  sample: Array<{ normalized_email: string; name: string; contact_type: string; status: string; exclusion_reason: string | null }>;
  estimated_campaign_credit: number | null;
  estimated_recipient_credit: number | null;
  estimated_total_credit: number | null;
};

/**
 * Run-readiness preview: audience counts plus billing estimates. Creates
 * no run, members, or charges. Billing denial surfaces as null estimates
 * rather than a failed preview.
 */
export class CampaignPreviewUseCase extends BaseUseCase<string, CampaignPreview, { uuid: string; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor; organizationId: string | null }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validated = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { uuid: validated.uuid, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor; organizationId: string | null }): Promise<CampaignPreview> {
    const { uuid, actor, organizationId } = context;

    await CampaignModelFactory();
    const campaign = await CampaignModel.findOne({ where: { uuid, deleted_at: null } });
    if (!campaign || (campaign.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign not found.");
    }

    await SegmentModelFactory();
    const segment = await SegmentModel.findOne({ where: { uuid: campaign.segment_id, deleted_at: null } });
    if (!segment || (segment.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }

    const resolution = await resolveSegmentAudience(organizationId, segment.contact_scope, segment.rules as unknown);

    let campaignCredit: number | null = null;
    let recipientCredit: number | null = null;
    try {
      const sendBilling = await checkTransaction(actor, "marketing:campaign:view:send");
      campaignCredit = typeof sendBilling.credit === "number" ? sendBilling.credit : null;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
    }
    try {
      const recipientBilling = await checkTransaction(actor, "marketing:recipient:create:send");
      recipientCredit = typeof recipientBilling.credit === "number" ? recipientBilling.credit : null;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
    }

    const total =
      campaignCredit !== null && recipientCredit !== null
        ? campaignCredit + recipientCredit * resolution.counts.eligible
        : null;

    return {
      ...resolution.counts,
      sample: resolution.members.slice(0, 10).map((member) => ({
        normalized_email: member.normalized_email,
        name: member.name,
        contact_type: member.contact_type,
        status: member.status,
        exclusion_reason: member.exclusion_reason,
      })),
      estimated_campaign_credit: campaignCredit,
      estimated_recipient_credit: recipientCredit,
      estimated_total_credit: total,
    };
  }
}
