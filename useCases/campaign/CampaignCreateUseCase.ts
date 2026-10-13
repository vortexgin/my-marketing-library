import Joi from "joi";
import { randomUUID } from "crypto";
import CampaignModelFactory, { CampaignModel, type Campaign } from "@/app/marketing/models/CampaignModel";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

export type CreateCampaignInput = {
  name: string;
  description?: string | null;
  objective?: string | null;
  template_id: string;
  segment_id: string;
  owner_id?: string | null;
  budget?: number | null;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string | null;
};

const createCampaignSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().allow("", null).max(2000).optional(),
  objective: Joi.string().trim().allow("", null).max(2000).optional(),
  template_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  segment_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  owner_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  budget: Joi.number().integer().min(0).allow(null).optional(),
  utm_source: Joi.string().trim().min(1).max(80).optional(),
  utm_medium: Joi.string().trim().min(1).max(80).optional(),
  utm_campaign: Joi.string().trim().allow("", null).max(160).optional(),
}).unknown(false);

export class CampaignCreateUseCase extends BaseUseCase<CreateCampaignInput, Campaign, { input: CreateCampaignInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateCampaignInput, actor?: ActivityActor): Promise<{ input: CreateCampaignInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateCampaignInput>(createCampaignSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    // Template and segment must exist in the same organization.
    await MarketingTemplateModelFactory();
    const template = await MarketingTemplateModel.findOne({ where: { uuid: validated.template_id, deleted_at: null } });
    if (!template || (template.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Template not found.");
    }
    await SegmentModelFactory();
    const segment = await SegmentModel.findOne({ where: { uuid: validated.segment_id, deleted_at: null } });
    if (!segment || (segment.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateCampaignInput; actor: ActivityActor; organizationId: string | null }): Promise<Campaign> {
    const { input, organizationId } = context;
    await CampaignModelFactory();

    const row = await CampaignModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      objective: input.objective?.trim() || null,
      template_id: input.template_id,
      segment_id: input.segment_id,
      owner_id: input.owner_id ?? null,
      status: "draft",
      budget: typeof input.budget === "number" ? input.budget : null,
      utm_source: input.utm_source?.trim() || "email",
      utm_medium: input.utm_medium?.trim() || "marketing",
      utm_campaign: input.utm_campaign?.trim() || null,
      deleted_at: null,
    });
    return CampaignModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: Campaign,
    context?: { input: CreateCampaignInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<Campaign> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "marketing_campaign",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
