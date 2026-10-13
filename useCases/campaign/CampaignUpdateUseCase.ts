import Joi from "joi";
import CampaignModelFactory, { CampaignModel, type Campaign, type CampaignStatus } from "@/app/marketing/models/CampaignModel";
import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type UpdateCampaignInput = {
  name?: string;
  description?: string | null;
  objective?: string | null;
  template_id?: string;
  segment_id?: string;
  owner_id?: string | null;
  budget?: number | null;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string | null;
  status?: CampaignStatus;
};

const updateCampaignSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().allow("", null).max(2000).optional(),
  objective: Joi.string().trim().allow("", null).max(2000).optional(),
  template_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  segment_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  owner_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  budget: Joi.number().integer().min(0).allow(null).optional(),
  utm_source: Joi.string().trim().min(1).max(80).optional(),
  utm_medium: Joi.string().trim().min(1).max(80).optional(),
  utm_campaign: Joi.string().trim().allow("", null).max(160).optional(),
  status: Joi.string().valid("draft", "scheduled", "running", "paused", "completed", "cancelled").optional(),
}).unknown(false).min(1);

/** Valid source → target transitions; completed/cancelled are terminal. */
const CAMPAIGN_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["running", "cancelled"],
  running: ["paused", "completed", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  cancelled: [],
};

const ACTIVE_RUN_STATUSES = ["preparing", "queued", "running", "paused"];

export class CampaignUpdateUseCase extends BaseUseCase<string, Campaign, { uuid: string; input: UpdateCampaignInput; actor: ActivityActor; organizationId: string | null }> {
  private campaignData?: CampaignModel | null;
  private beforeData?: Campaign | null;

  protected async preExec(uuid: string, input: UpdateCampaignInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateCampaignInput; actor: ActivityActor; organizationId: string | null }> {
    const validatedInput = await this.validate<UpdateCampaignInput>(updateCampaignSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CampaignModelFactory();
    this.campaignData = await CampaignModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.campaignData || (this.campaignData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign not found.");
    }
    this.beforeData = CampaignModel.toApi(this.campaignData.toJSON());

    const nextStatus = validatedInput.status;
    const currentStatus = this.beforeData.status;
    if (typeof nextStatus === "string" && nextStatus && nextStatus !== currentStatus) {
      const allowed = CAMPAIGN_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(nextStatus)) {
        throw new BadParameterException(`Cannot move campaign from ${currentStatus} to ${nextStatus}.`);
      }
    }

    // Recipient-affecting fields lock while a run is active.
    if (validatedInput.segment_id !== undefined || validatedInput.template_id !== undefined) {
      await CampaignRunModelFactory();
      const activeRun = await CampaignRunModel.findOne({
        where: { campaign_id: validatedUuid.uuid, status: ACTIVE_RUN_STATUSES, deleted_at: null },
      });
      if (activeRun) {
        throw new BadParameterException("Segment and template are locked while a run is active.");
      }
    }

    if (validatedInput.template_id !== undefined) {
      await MarketingTemplateModelFactory();
      const template = await MarketingTemplateModel.findOne({ where: { uuid: validatedInput.template_id, deleted_at: null } });
      if (!template || (template.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Template not found.");
      }
    }
    if (validatedInput.segment_id !== undefined) {
      await SegmentModelFactory();
      const segment = await SegmentModel.findOne({ where: { uuid: validatedInput.segment_id, deleted_at: null } });
      if (!segment || (segment.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Segment not found.");
      }
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; input: UpdateCampaignInput; actor: ActivityActor; organizationId: string | null }): Promise<Campaign> {
    const { input } = context;
    const nextData: Record<string, unknown> = { updated_at: new Date() };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      nextData.description = input.description?.trim() || null;
    }
    if (input.objective !== undefined) {
      nextData.objective = input.objective?.trim() || null;
    }
    if (typeof input.template_id === "string" && input.template_id) {
      nextData.template_id = input.template_id;
    }
    if (typeof input.segment_id === "string" && input.segment_id) {
      nextData.segment_id = input.segment_id;
    }
    if (input.owner_id !== undefined) {
      nextData.owner_id = input.owner_id;
    }
    if (input.budget !== undefined) {
      nextData.budget = typeof input.budget === "number" ? input.budget : null;
    }
    if (typeof input.utm_source === "string" && input.utm_source.trim()) {
      nextData.utm_source = input.utm_source.trim();
    }
    if (typeof input.utm_medium === "string" && input.utm_medium.trim()) {
      nextData.utm_medium = input.utm_medium.trim();
    }
    if (input.utm_campaign !== undefined) {
      nextData.utm_campaign = input.utm_campaign?.trim() || null;
    }
    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.campaignData?.update(nextData);
    return CampaignModel.toApi(this.campaignData?.toJSON());
  }

  protected async postExec(
    result: Campaign,
    context?: { uuid: string; input: UpdateCampaignInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<Campaign> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_campaign",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
