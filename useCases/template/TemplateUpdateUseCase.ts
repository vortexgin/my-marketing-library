import Joi from "joi";
import MarketingTemplateModelFactory, { MarketingTemplateModel, type MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { rejectUnsafeHtml } from "@/app/marketing/libraries/templateRenderer";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type UpdateTemplateInput = {
  name?: string;
  subject?: string;
  preview_text?: string | null;
  html_body?: string;
  text_body?: string;
  status?: "active" | "inactive";
};

const updateTemplateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  subject: Joi.string().trim().min(2).max(255).optional(),
  preview_text: Joi.string().trim().allow("", null).max(255).optional(),
  html_body: Joi.string().min(1).max(200000).optional(),
  text_body: Joi.string().min(1).max(100000).optional(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false).min(1);

export class TemplateUpdateUseCase extends BaseUseCase<string, MarketingTemplate, { uuid: string; input: UpdateTemplateInput; actor: ActivityActor }> {
  private templateData?: MarketingTemplateModel | null;
  private beforeData?: MarketingTemplate | null;

  protected async preExec(uuid: string, input: UpdateTemplateInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateTemplateInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateTemplateInput>(updateTemplateSchema, input ?? {});

    if (typeof validatedInput.html_body === "string") {
      const unsafe = rejectUnsafeHtml(validatedInput.html_body);
      if (unsafe) {
        throw new BadParameterException(unsafe);
      }
    }

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await MarketingTemplateModelFactory();
    this.templateData = await MarketingTemplateModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.templateData || (this.templateData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Template not found.");
    }
    this.beforeData = MarketingTemplateModel.toApi(this.templateData.toJSON());

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateTemplateInput; actor: ActivityActor }): Promise<MarketingTemplate> {
    const { input } = context;
    const nextData: Record<string, unknown> = { updated_at: new Date() };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }
    if (typeof input.subject === "string" && input.subject.trim()) {
      nextData.subject = input.subject.trim();
    }
    if (input.preview_text !== undefined) {
      nextData.preview_text = input.preview_text?.trim() || null;
    }
    if (typeof input.html_body === "string") {
      nextData.html_body = input.html_body;
    }
    if (typeof input.text_body === "string") {
      nextData.text_body = input.text_body;
    }
    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.templateData?.update(nextData);
    return MarketingTemplateModel.toApi(this.templateData?.toJSON());
  }

  protected async postExec(
    result: MarketingTemplate,
    context?: { uuid: string; input: UpdateTemplateInput; actor: ActivityActor },
  ): Promise<MarketingTemplate> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_template",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
