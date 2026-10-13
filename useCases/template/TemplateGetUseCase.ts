import Joi from "joi";
import MarketingTemplateModelFactory, { MarketingTemplateModel, type MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getTemplateSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class TemplateGetUseCase extends BaseUseCase<string, MarketingTemplate, string> {
  private templateData?: MarketingTemplateModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getTemplateSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await MarketingTemplateModelFactory();
    this.templateData = await MarketingTemplateModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.templateData || (this.templateData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Template not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<MarketingTemplate> {
    if (!this.templateData) {
      throw new NotFoundException("Template not found.");
    }
    return MarketingTemplateModel.toApi(this.templateData.toJSON());
  }
}
