import MarketingFormModelFactory, { MarketingFormModel, type MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import Joi from "joi";

export class FormDeleteUseCase extends BaseUseCase<string, MarketingForm, { uuid: string; actor: ActivityActor }> {
  private formData?: MarketingFormModel | null;
  private beforeData?: MarketingForm | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
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

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<MarketingForm> {
    await this.formData?.update({ deleted_at: new Date(), updated_at: new Date() });
    return MarketingFormModel.toApi(this.formData?.toJSON());
  }

  protected async postExec(
    result: MarketingForm,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<MarketingForm> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "delete",
      entity: "marketing_form",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
