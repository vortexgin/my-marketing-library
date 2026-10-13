import Joi from "joi";
import ContactPreferenceModelFactory, { ContactPreferenceModel, type ContactPreference } from "@/app/marketing/models/ContactPreferenceModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type UpdateContactPreferenceInput = {
  status: "opted_in" | "opted_out";
  consent_evidence?: string | null;
};

const updateContactPreferenceSchema = Joi.object({
  status: Joi.string().valid("opted_in", "opted_out").required(),
  consent_evidence: Joi.string().trim().allow("", null).max(500).optional(),
}).unknown(false);

/**
 * Explicit protected re-opt-in / manual opt-out. Suppressed addresses are
 * never touched here — suppression is system/webhook-owned.
 */
export class ContactPreferenceUpdateUseCase extends BaseUseCase<string, ContactPreference, { uuid: string; input: UpdateContactPreferenceInput; actor: ActivityActor }> {
  private preferenceData?: ContactPreferenceModel | null;
  private beforeData?: ContactPreference | null;

  protected async preExec(uuid: string, input: UpdateContactPreferenceInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateContactPreferenceInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateContactPreferenceInput>(updateContactPreferenceSchema, input);

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await ContactPreferenceModelFactory();
    this.preferenceData = await ContactPreferenceModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.preferenceData || (this.preferenceData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Contact preference not found.");
    }
    this.beforeData = ContactPreferenceModel.toApi(this.preferenceData.toJSON());

    if (this.beforeData.status === "suppressed") {
      throw new BadParameterException("Suppressed addresses can only be released by the suppression flow.");
    }
    if (validatedInput.status === "opted_in" && !validatedInput.consent_evidence?.trim()) {
      throw new BadParameterException("Re-opt-in requires consent evidence.");
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateContactPreferenceInput; actor: ActivityActor }): Promise<ContactPreference> {
    const { input } = context;
    const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
    await this.preferenceData?.update({
      status: input.status,
      consent_source: "manual",
      consent_at: input.status === "opted_in" ? new Date() : this.beforeData?.consent_at ? new Date(this.beforeData.consent_at) : null,
      consent_evidence: input.consent_evidence?.trim().slice(0, 500) || this.beforeData?.consent_evidence || null,
      unsubscribed_at: input.status === "opted_out" ? new Date() : null,
      updated_by: typeof actorUuid === "string" ? actorUuid : null,
      updated_at: new Date(),
    });

    return ContactPreferenceModel.toApi(this.preferenceData?.toJSON());
  }

  protected async postExec(
    result: ContactPreference,
    context?: { uuid: string; input: UpdateContactPreferenceInput; actor: ActivityActor },
  ): Promise<ContactPreference> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_contact_preference",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
