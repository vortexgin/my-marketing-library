import Joi from "joi";
import CampaignModelFactory, { CampaignModel, type Campaign } from "@/app/marketing/models/CampaignModel";
import OrganizationModelFactory, { OrganizationModel } from "@/app/sass/models/OrganizationModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { orgLocalToUtc } from "@/app/marketing/libraries/timezone";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const scheduleCampaignSchema = Joi.object({
  scheduled_at: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).required(),
}).unknown(false);

export class CampaignScheduleUseCase extends BaseUseCase<string, Campaign, { uuid: string; scheduledAt: Date; actor: ActivityActor }> {
  private campaignData?: CampaignModel | null;
  private beforeData?: Campaign | null;

  protected async preExec(uuid: string, input: { scheduled_at: string }, actor?: ActivityActor): Promise<{ uuid: string; scheduledAt: Date; actor: ActivityActor }> {
    const validatedInput = await this.validate<{ scheduled_at: string }>(scheduleCampaignSchema, input ?? {});

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

    if (this.beforeData.status !== "draft" && this.beforeData.status !== "scheduled") {
      throw new BadParameterException(`Only draft or scheduled campaigns can be scheduled (status is ${this.beforeData.status}).`);
    }

    // Organization-local input round-trips to UTC; past datetimes rejected.
    let timezone = "Asia/Jakarta";
    if (organizationId) {
      await OrganizationModelFactory();
      const organization = await OrganizationModel.findOne({ where: { uuid: organizationId, deleted_at: null } }).catch(() => null);
      if (organization?.timezone) {
        timezone = organization.timezone;
      }
    }
    let scheduledAt: Date;
    try {
      scheduledAt = orgLocalToUtc(validatedInput.scheduled_at, timezone);
    } catch (error) {
      throw new BadParameterException((error as Error).message);
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadParameterException("Scheduled time must be in the future.");
    }

    return { uuid: validatedUuid.uuid, scheduledAt, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; scheduledAt: Date; actor: ActivityActor }): Promise<Campaign> {
    await this.campaignData?.update({ status: "scheduled", scheduled_at: context.scheduledAt, updated_at: new Date() });
    return CampaignModel.toApi(this.campaignData?.toJSON());
  }

  protected async postExec(
    result: Campaign,
    context?: { uuid: string; scheduledAt: Date; actor: ActivityActor },
  ): Promise<Campaign> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_campaign",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
