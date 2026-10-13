import Joi from "joi";
import { randomUUID } from "crypto";
import MarketingTemplateModelFactory, { MarketingTemplateModel, type MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { rejectUnsafeHtml } from "@/app/marketing/libraries/templateRenderer";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";

export type CreateTemplateInput = {
  name: string;
  subject: string;
  preview_text?: string | null;
  html_body: string;
  text_body: string;
  status?: "active" | "inactive";
};

const createTemplateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  subject: Joi.string().trim().min(2).max(255).required(),
  preview_text: Joi.string().trim().allow("", null).max(255).optional(),
  html_body: Joi.string().min(1).max(200000).required(),
  text_body: Joi.string().min(1).max(100000).required(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

export class TemplateCreateUseCase extends BaseUseCase<CreateTemplateInput, MarketingTemplate, { input: CreateTemplateInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateTemplateInput, actor?: ActivityActor): Promise<{ input: CreateTemplateInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateTemplateInput>(createTemplateSchema, input);

    const unsafe = rejectUnsafeHtml(validated.html_body);
    if (unsafe) {
      throw new BadParameterException(unsafe);
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateTemplateInput; actor: ActivityActor; organizationId: string | null }): Promise<MarketingTemplate> {
    const { input, organizationId } = context;
    await MarketingTemplateModelFactory();

    const row = await MarketingTemplateModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name: input.name.trim(),
      subject: input.subject.trim(),
      preview_text: input.preview_text?.trim() || null,
      html_body: input.html_body,
      text_body: input.text_body,
      status: input.status ?? "active",
      deleted_at: null,
    });
    return MarketingTemplateModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: MarketingTemplate,
    context?: { input: CreateTemplateInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<MarketingTemplate> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "marketing_template",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
