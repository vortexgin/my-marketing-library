import Joi from "joi";
import MarketingFormModelFactory, { MarketingFormModel, type MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getFormSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class FormGetUseCase extends BaseUseCase<string, MarketingForm, string> {
  private formData?: MarketingFormModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getFormSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await MarketingFormModelFactory();
    this.formData = await MarketingFormModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.formData || (this.formData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Form not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<MarketingForm> {
    if (!this.formData) {
      throw new NotFoundException("Form not found.");
    }
    return MarketingFormModel.toApi(this.formData.toJSON());
  }
}
