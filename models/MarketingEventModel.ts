import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MarketingEvent = {
  uuid: string;
  organization_id: string | null;
  campaign_id: string | null;
  campaign_run_id: string | null;
  message_id: string | null;
  provider_event_id: string | null;
  event_type: string;
  normalized_email: string | null;
  payload_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MarketingEventModelAttributes = Partial<Omit<MarketingEvent, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type MarketingEventModelCreationAttributes = Partial<MarketingEventModelAttributes>;

export class MarketingEventModel extends Model<MarketingEventModelAttributes, MarketingEventModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_id: string | null;
  declare campaign_run_id: string | null;
  declare message_id: string | null;
  declare provider_event_id: string | null;
  declare event_type: string;
  declare normalized_email: string | null;
  declare payload_summary: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): MarketingEvent {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_id: row.campaign_id ?? null,
      campaign_run_id: row.campaign_run_id ?? null,
      message_id: row.message_id ?? null,
      provider_event_id: row.provider_event_id ?? null,
      event_type: row.event_type,
      normalized_email: row.normalized_email ?? null,
      payload_summary: (row.payload_summary ?? {}) as Record<string, unknown>,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let marketingEventModelPromise: Promise<typeof MarketingEventModel> | null = null;

export async function getMarketingEventModel(): Promise<typeof MarketingEventModel> {
  if ((MarketingEventModel as any).initialized) {
    return MarketingEventModel;
  }
  if (!marketingEventModelPromise) {
    marketingEventModelPromise = initMarketingEventModel().catch((error) => {
      marketingEventModelPromise = null;
      throw error;
    });
  }
  return marketingEventModelPromise;
}

async function initMarketingEventModel(): Promise<typeof MarketingEventModel> {
  const sequelize = await getSequelizeInstance();

  {
    MarketingEventModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_run_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        message_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        provider_event_id: { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
        event_type: { type: DataTypes.STRING(60), allowNull: false },
        normalized_email: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        payload_summary: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "MarketingEvent",
        tableName: "marketing_events",
        timestamps: false,
        underscored: true,
      },
    );

    (MarketingEventModel as any).initialized = true;
  }
  return MarketingEventModel;
}

export default async function MarketingEventModelFactory() {
  return getMarketingEventModel();
}
