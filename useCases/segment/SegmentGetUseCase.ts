import Joi from "joi";
import SegmentModelFactory, { SegmentModel, type Segment } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getSegmentSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class SegmentGetUseCase extends BaseUseCase<string, Segment, string> {
  private segmentData?: SegmentModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getSegmentSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await SegmentModelFactory();
    this.segmentData = await SegmentModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    if (!this.segmentData || (this.segmentData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<Segment> {
    if (!this.segmentData) {
      throw new NotFoundException("Segment not found.");
    }
    return SegmentModel.toApi(this.segmentData.toJSON());
  }
}
