import Joi from "joi";
import LandingPageModelFactory, { LandingPageModel, type LandingPage } from "@/app/marketing/models/LandingPageModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLandingPageSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LandingPageGetUseCase extends BaseUseCase<string, LandingPage, string> {
  private pageData?: LandingPageModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getLandingPageSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await LandingPageModelFactory();
    this.pageData = await LandingPageModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.pageData || (this.pageData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Landing page not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<LandingPage> {
    if (!this.pageData) {
      throw new NotFoundException("Landing page not found.");
    }
    return LandingPageModel.toApi(this.pageData.toJSON());
  }
}
