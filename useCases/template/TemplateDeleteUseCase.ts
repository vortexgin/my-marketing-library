import MarketingTemplateModelFactory, { MarketingTemplateModel, type MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import Joi from "joi";

export class TemplateDeleteUseCase extends BaseUseCase<string, MarketingTemplate, { uuid: string; actor: ActivityActor }> {
  private templateData?: MarketingTemplateModel | null;
  private beforeData?: MarketingTemplate | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
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

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<MarketingTemplate> {
    await this.templateData?.update({ deleted_at: new Date(), updated_at: new Date() });
    return MarketingTemplateModel.toApi(this.templateData?.toJSON());
  }

  protected async postExec(
    result: MarketingTemplate,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<MarketingTemplate> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "delete",
      entity: "marketing_template",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
