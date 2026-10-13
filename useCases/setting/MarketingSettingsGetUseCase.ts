import MarketingSettingsModelFactory, { MarketingSettingsModel, type MarketingSettings } from "@/app/marketing/models/MarketingSettingsModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

export class MarketingSettingsGetUseCase extends BaseUseCase<void, MarketingSettings, string | null> {
  protected async preExec(_input?: void, actor?: ActivityActor): Promise<string | null> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    return typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;
  }

  protected async execute(organizationId: string | null): Promise<MarketingSettings> {
    await MarketingSettingsModelFactory();
    const row = await MarketingSettingsModel.findOne({
      where: { organization_id: organizationId, status: "active", deleted_at: null },
    });
    if (!row) {
      throw new NotFoundException("Marketing settings are not configured for this organization.");
    }
    return MarketingSettingsModel.toApi(row.toJSON());
  }
}
