import SegmentModelFactory, { SegmentModel, type Segment } from "@/app/marketing/models/SegmentModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import Joi from "joi";

export class SegmentDeleteUseCase extends BaseUseCase<string, Segment, { uuid: string; actor: ActivityActor }> {
  private segmentData?: SegmentModel | null;
  private beforeData?: Segment | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await SegmentModelFactory();
    this.segmentData = await SegmentModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.segmentData || (this.segmentData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Segment not found.");
    }
    this.beforeData = SegmentModel.toApi(this.segmentData.toJSON());

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(): Promise<Segment> {
    await this.segmentData?.update({ deleted_at: new Date(), updated_at: new Date() });
    return SegmentModel.toApi(this.segmentData?.toJSON());
  }

  protected async postExec(
    result: Segment,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<Segment> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "delete",
      entity: "marketing_segment",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
