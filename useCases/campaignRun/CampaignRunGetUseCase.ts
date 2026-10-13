import Joi from "joi";
import CampaignRunModelFactory, { CampaignRunModel, type CampaignRun } from "@/app/marketing/models/CampaignRunModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCampaignRunSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class CampaignRunGetUseCase extends BaseUseCase<string, CampaignRun, string> {
  private runData?: CampaignRunModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getCampaignRunSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CampaignRunModelFactory();
    this.runData = await CampaignRunModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.runData || (this.runData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign run not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<CampaignRun> {
    if (!this.runData) {
      throw new NotFoundException("Campaign run not found.");
    }
    return CampaignRunModel.toApi(this.runData.toJSON());
  }
}
