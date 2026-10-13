import Joi from "joi";
import CampaignRunModelFactory, { CampaignRunModel, type CampaignRun } from "@/app/marketing/models/CampaignRunModel";
import CampaignModelFactory, { CampaignModel } from "@/app/marketing/models/CampaignModel";
import MessageModelFactory, { MessageModel } from "@/app/marketing/models/MessageModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

export type RunTransition = "pause" | "resume" | "cancel";

const TRANSITIONS: Record<RunTransition, { from: string[]; to: "paused" | "queued" | "cancelled" }> = {
  pause: { from: ["queued", "running"], to: "paused" },
  resume: { from: ["paused", "billing_exhausted"], to: "queued" },
  cancel: { from: ["preparing", "queued", "running", "paused", "billing_exhausted"], to: "cancelled" },
};

export class CampaignRunTransitionUseCase extends BaseUseCase<string, CampaignRun, { uuid: string; transition: RunTransition; actor: ActivityActor }> {
  private runData?: CampaignRunModel | null;
  private beforeData?: CampaignRun | null;
  private transition: RunTransition = "pause";

  constructor(transition: RunTransition) {
    super();
    this.transition = transition;
  }

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; transition: RunTransition; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CampaignRunModelFactory();
    this.runData = await CampaignRunModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.runData || (this.runData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Campaign run not found.");
    }
    this.beforeData = CampaignRunModel.toApi(this.runData.toJSON());

    const rule = TRANSITIONS[this.transition];
    if (!rule.from.includes(this.beforeData.status)) {
      throw new BadParameterException(`Run cannot ${this.transition} from ${this.beforeData.status}.`);
    }

    return { uuid: validatedUuid.uuid, transition: this.transition, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; transition: RunTransition; actor: ActivityActor }): Promise<CampaignRun> {
    const { transition } = context;
    const to = TRANSITIONS[transition].to;

    if (transition === "cancel") {
      // Cancel marks unclaimed queued/processing messages cancelled and
      // preserves accepted/delivered history.
      const { getSequelizeInstance } = await import("@/database/sequelize");
      const sequelize = await getSequelizeInstance();
      await sequelize.transaction(async (t: any) => {
        await this.runData?.update(
          { status: to, completed_at: new Date(), updated_at: new Date() },
          { transaction: t },
        );
        await MessageModelFactory();
        await MessageModel.update(
          { status: "cancelled", updated_at: new Date() },
          {
            where: { campaign_run_id: context.uuid, status: ["queued", "processing"], deleted_at: null },
            transaction: t,
          },
        );
      });

      await CampaignModelFactory();
      const campaign = await CampaignModel.findOne({ where: { uuid: this.beforeData?.campaign_id, deleted_at: null } });
      if (campaign && ["running", "paused"].includes(campaign.status)) {
        await campaign.update({ status: "cancelled", updated_at: new Date() });
      }
    } else {
      await this.runData?.update({ status: to, updated_at: new Date() });

      await CampaignModelFactory();
      const campaign = await CampaignModel.findOne({ where: { uuid: this.beforeData?.campaign_id, deleted_at: null } });
      if (campaign) {
        if (to === "paused" && campaign.status === "running") {
          await campaign.update({ status: "paused", updated_at: new Date() });
        } else if (to === "queued" && campaign.status === "paused") {
          await campaign.update({ status: "running", updated_at: new Date() });
        }
      }
    }

    return CampaignRunModel.toApi(this.runData?.toJSON());
  }

  protected async postExec(
    result: CampaignRun,
    context?: { uuid: string; transition: RunTransition; actor: ActivityActor },
  ): Promise<CampaignRun> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "marketing_campaign_run",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
