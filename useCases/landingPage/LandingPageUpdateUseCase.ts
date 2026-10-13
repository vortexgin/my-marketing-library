import Joi from "joi";
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

export type UpdateLandingPageInput = {
  name?: string;
  organization_slug?: string;
  slug?: string;
  title?: string;
  seo_description?: string | null;
  content?: Record<string, unknown>;
  campaign_id?: string | null;
  form_id?: string | null;
};

const updateLandingPageSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  organization_slug: Joi.string().trim().min(1).max(120).optional(),
  slug: Joi.string().trim().min(1).max(120).optional(),
  title: Joi.string().trim().min(2).max(200).optional(),
  seo_description: Joi.string().trim().allow("", null).max(300).optional(),
  content: Joi.object().optional(),
  campaign_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  form_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
}).unknown(false).min(1);

export class LandingPageUpdateUseCase extends BaseUseCase<string, LandingPage, { uuid: string; input: UpdateLandingPageInput; actor: ActivityActor; organizationId: string | null }> {
  private pageData?: LandingPageModel | null;
  private beforeData?: LandingPage | null;

  protected async preExec(uuid: string, input: UpdateLandingPageInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLandingPageInput; actor: ActivityActor; organizationId: string | null }> {
    const validatedInput = await this.validate<UpdateLandingPageInput>(updateLandingPageSchema, input ?? {});
    if (validatedInput.organization_slug !== undefined) {
      checkSlug(validatedInput.organization_slug, "organization_slug");
    }
    if (validatedInput.slug !== undefined) {
      checkSlug(validatedInput.slug, "slug");
    }
    if (validatedInput.content !== undefined) {
      validateLandingContent(validatedInput.content);
    }

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await LandingPageModelFactory();
    this.pageData = await LandingPageModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.pageData || (this.pageData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Landing page not found.");
    }
    this.beforeData = LandingPageModel.toApi(this.pageData.toJSON());

    if (validatedInput.campaign_id !== undefined && validatedInput.campaign_id !== null) {
      await CampaignModelFactory();
      const campaign = await CampaignModel.findOne({ where: { uuid: validatedInput.campaign_id, deleted_at: null } });
      if (!campaign || (campaign.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Campaign not found.");
      }
    }
    if (validatedInput.form_id !== undefined && validatedInput.form_id !== null) {
      await MarketingFormModelFactory();
      const form = await MarketingFormModel.findOne({ where: { uuid: validatedInput.form_id, deleted_at: null } });
      if (!form || form.status !== "active" || (form.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Form not found.");
      }
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { uuid: string; input: UpdateLandingPageInput; actor: ActivityActor; organizationId: string | null }): Promise<LandingPage> {
    const { input } = context;
    const nextData: Record<string, unknown> = { updated_at: new Date() };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }
    if (typeof input.organization_slug === "string" && input.organization_slug.trim()) {
      nextData.organization_slug = input.organization_slug.trim().toLowerCase();
    }
    if (typeof input.slug === "string" && input.slug.trim()) {
      nextData.slug = input.slug.trim().toLowerCase();
    }
    if (typeof input.title === "string" && input.title.trim()) {
      nextData.title = input.title.trim();
    }
    if (input.seo_description !== undefined) {
      nextData.seo_description = input.seo_description?.trim() || null;
    }
    if (input.content !== undefined) {
      nextData.content = input.content;
    }
    if (input.campaign_id !== undefined) {
      nextData.campaign_id = input.campaign_id;
    }
    if (input.form_id !== undefined) {
      nextData.form_id = input.form_id;
    }

    try {
      await this.pageData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A landing page with this slug already exists.");
      }
      throw error;
    }
    return LandingPageModel.toApi(this.pageData?.toJSON());
  }

  protected async postExec(
    result: LandingPage,
    context?: { uuid: string; input: UpdateLandingPageInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<LandingPage> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_landing_page",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
