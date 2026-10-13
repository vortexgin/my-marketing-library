import CampaignModelFactory, { CampaignModel, type Campaign } from "@/app/marketing/models/CampaignModel";
import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";
import Joi from "joi";

export class CampaignDeleteUseCase extends BaseUseCase<string, Campaign, { uuid: string; actor: ActivityActor }> {
  private campaignData?: CampaignModel | null;
  private beforeData?: Campaign | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CampaignModelFactory();
    this.campaignData = await CampaignModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.campaignData || (this.campaignData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign not found.");
    }
    this.beforeData = CampaignModel.toApi(this.campaignData.toJSON());

    if (this.beforeData.status === "running" || this.beforeData.status === "paused") {
      throw new BadParameterException("Campaigns with an active lifecycle cannot be deleted. Cancel first.");
    }
    await CampaignRunModelFactory();
    const activeRun = await CampaignRunModel.findOne({
      where: { campaign_id: validatedUuid.uuid, status: ["preparing", "queued", "running", "paused"], deleted_at: null },
    });
    if (activeRun) {
      throw new BadParameterException("Campaigns with an active run cannot be deleted.");
    }

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<Campaign> {
    await this.campaignData?.update({ status: "cancelled", deleted_at: new Date(), updated_at: new Date() });
    return CampaignModel.toApi(this.campaignData?.toJSON());
  }

  protected async postExec(
    result: Campaign,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<Campaign> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "delete",
      entity: "marketing_campaign",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
