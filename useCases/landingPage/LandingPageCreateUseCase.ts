import Joi from "joi";
import { randomUUID } from "crypto";
import { UniqueConstraintError } from "sequelize";
import LandingPageModelFactory, { LandingPageModel, type LandingPage } from "@/app/marketing/models/LandingPageModel";
import CampaignModelFactory, { CampaignModel } from "@/app/marketing/models/CampaignModel";
import MarketingFormModelFactory, { MarketingFormModel } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { checkSlug, validateLandingContent } from "@/app/marketing/libraries/landingBlocks";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

export type CreateLandingPageInput = {
  name: string;
  organization_slug: string;
  slug: string;
  title: string;
  seo_description?: string | null;
  content: Record<string, unknown>;
  campaign_id?: string | null;
  form_id?: string | null;
};

const createLandingPageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  organization_slug: Joi.string().trim().min(1).max(120).required(),
  slug: Joi.string().trim().min(1).max(120).required(),
  title: Joi.string().trim().min(2).max(200).required(),
  seo_description: Joi.string().trim().allow("", null).max(300).optional(),
  content: Joi.object().required(),
  campaign_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  form_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
}).unknown(false);

export class LandingPageCreateUseCase extends BaseUseCase<CreateLandingPageInput, LandingPage, { input: CreateLandingPageInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateLandingPageInput, actor?: ActivityActor): Promise<{ input: CreateLandingPageInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateLandingPageInput>(createLandingPageSchema, input);
    checkSlug(validated.organization_slug, "organization_slug");
    checkSlug(validated.slug, "slug");
    validateLandingContent(validated.content);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    if (validated.campaign_id) {
      await CampaignModelFactory();
      const campaign = await CampaignModel.findOne({ where: { uuid: validated.campaign_id, deleted_at: null } });
      if (!campaign || (campaign.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Campaign not found.");
      }
    }
    if (validated.form_id) {
      await MarketingFormModelFactory();
      const form = await MarketingFormModel.findOne({ where: { uuid: validated.form_id, deleted_at: null } });
      if (!form || form.status !== "active" || (form.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Form not found.");
      }
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateLandingPageInput; actor: ActivityActor; organizationId: string | null }): Promise<LandingPage> {
    const { input, organizationId } = context;
    await LandingPageModelFactory();

    try {
      const row = await LandingPageModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        campaign_id: input.campaign_id ?? null,
        form_id: input.form_id ?? null,
        name: input.name.trim(),
        organization_slug: input.organization_slug.trim().toLowerCase(),
        slug: input.slug.trim().toLowerCase(),
        title: input.title.trim(),
        seo_description: input.seo_description?.trim() || null,
        content: input.content,
        status: "draft",
        deleted_at: null,
      });
      return LandingPageModel.toApi(row.toJSON());
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A landing page with this slug already exists.");
      }
      throw error;
    }
  }

  protected async postExec(
    result: LandingPage,
    context?: { input: CreateLandingPageInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<LandingPage> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "marketing_landing_page",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
