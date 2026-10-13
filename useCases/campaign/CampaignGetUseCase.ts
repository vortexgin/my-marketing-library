import Joi from "joi";
import CampaignModelFactory, { CampaignModel, type Campaign } from "@/app/marketing/models/CampaignModel";
import MarketingTemplateModelFactory, { MarketingTemplateModel } from "@/app/marketing/models/MarketingTemplateModel";
import SegmentModelFactory, { SegmentModel } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCampaignSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export type CampaignDetail = Campaign & { template_name: string | null; segment_name: string | null };

export class CampaignGetUseCase extends BaseUseCase<string, CampaignDetail, string> {
  private campaignData?: CampaignModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getCampaignSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CampaignModelFactory();
    this.campaignData = await CampaignModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.campaignData || (this.campaignData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<CampaignDetail> {
    if (!this.campaignData) {
      throw new NotFoundException("Campaign not found.");
    }
    const api = CampaignModel.toApi(this.campaignData.toJSON());

    await MarketingTemplateModelFactory();
    await SegmentModelFactory();
    const [template, segment] = await Promise.all([
      MarketingTemplateModel.findOne({ where: { uuid: api.template_id, deleted_at: null } }).catch(() => null),
      SegmentModel.findOne({ where: { uuid: api.segment_id, deleted_at: null } }).catch(() => null),
    ]);

    return { ...api, template_name: template?.name ?? null, segment_name: segment?.name ?? null };
  }
}
