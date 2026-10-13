import Joi from "joi";
import { randomUUID } from "crypto";
import MarketingFormModelFactory, { MarketingFormModel, type MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { isSafeUrl } from "@/app/marketing/libraries/templateRenderer";
import { validateFormFields } from "@/app/marketing/libraries/formFields";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";

export type CreateFormInput = {
  name: string;
  fields: Record<string, unknown>;
  consent_text: string;
  success_message: string;
  redirect_url?: string | null;
  status?: "active" | "inactive";
};

const createFormSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  fields: Joi.object().required(),
  consent_text: Joi.string().trim().allow("").max(2000).required(),
  success_message: Joi.string().trim().min(1).max(500).required(),
  redirect_url: Joi.string().trim().allow("", null).max(2000).optional(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

export class FormCreateUseCase extends BaseUseCase<CreateFormInput, MarketingForm, { input: CreateFormInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateFormInput, actor?: ActivityActor): Promise<{ input: CreateFormInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateFormInput>(createFormSchema, input);
    validateFormFields(validated.fields);
    if (validated.redirect_url?.trim() && !isSafeUrl(validated.redirect_url.trim())) {
      throw new BadParameterException("redirect_url must be an https:// URL.");
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateFormInput; actor: ActivityActor; organizationId: string | null }): Promise<MarketingForm> {
    const { input, organizationId } = context;
    await MarketingFormModelFactory();

    const row = await MarketingFormModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name: input.name.trim(),
      fields: input.fields,
      consent_text: input.consent_text,
      success_message: input.success_message.trim(),
      redirect_url: input.redirect_url?.trim() || null,
      status: input.status ?? "active",
      deleted_at: null,
    });
    return MarketingFormModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: MarketingForm,
    context?: { input: CreateFormInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<MarketingForm> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "marketing_form",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
