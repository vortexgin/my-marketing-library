import Joi from "joi";
import MarketingFormModelFactory, { MarketingFormModel, type MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { isSafeUrl } from "@/app/marketing/libraries/templateRenderer";
import { validateFormFields } from "@/app/marketing/libraries/formFields";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type UpdateFormInput = {
  name?: string;
  fields?: Record<string, unknown>;
  consent_text?: string;
  success_message?: string;
  redirect_url?: string | null;
  status?: "active" | "inactive";
};

const updateFormSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  fields: Joi.object().optional(),
  consent_text: Joi.string().trim().allow("").max(2000).optional(),
  success_message: Joi.string().trim().min(1).max(500).optional(),
  redirect_url: Joi.string().trim().allow("", null).max(2000).optional(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false).min(1);

export class FormUpdateUseCase extends BaseUseCase<string, MarketingForm, { uuid: string; input: UpdateFormInput; actor: ActivityActor }> {
  private formData?: MarketingFormModel | null;
  private beforeData?: MarketingForm | null;

  protected async preExec(uuid: string, input: UpdateFormInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateFormInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateFormInput>(updateFormSchema, input ?? {});
    if (validatedInput.fields !== undefined) {
      validateFormFields(validatedInput.fields);
    }
    if (validatedInput.redirect_url?.trim() && !isSafeUrl(validatedInput.redirect_url.trim())) {
      throw new BadParameterException("redirect_url must be an https:// URL.");
    }

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await MarketingFormModelFactory();
    this.formData = await MarketingFormModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.formData || (this.formData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Form not found.");
    }
    this.beforeData = MarketingFormModel.toApi(this.formData.toJSON());

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateFormInput; actor: ActivityActor }): Promise<MarketingForm> {
    const { input } = context;
    const nextData: Record<string, unknown> = { updated_at: new Date() };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }
    if (input.fields !== undefined) {
      nextData.fields = input.fields;
    }
    if (input.consent_text !== undefined) {
      nextData.consent_text = input.consent_text;
    }
    if (typeof input.success_message === "string" && input.success_message.trim()) {
      nextData.success_message = input.success_message.trim();
    }
    if (input.redirect_url !== undefined) {
      nextData.redirect_url = input.redirect_url?.trim() || null;
    }
    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.formData?.update(nextData);
    return MarketingFormModel.toApi(this.formData?.toJSON());
  }

  protected async postExec(
    result: MarketingForm,
    context?: { uuid: string; input: UpdateFormInput; actor: ActivityActor },
  ): Promise<MarketingForm> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_form",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
