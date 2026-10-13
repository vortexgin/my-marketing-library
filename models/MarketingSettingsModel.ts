import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MarketingSettings = {
  uuid: string;
  organization_id: string | null;
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  default_utm_source: string;
  default_utm_medium: string;
  default_consent_text: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MarketingSettingsModelAttributes = Partial<Omit<MarketingSettings, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type MarketingSettingsModelCreationAttributes = Partial<MarketingSettingsModelAttributes>;

export class MarketingSettingsModel extends Model<MarketingSettingsModelAttributes, MarketingSettingsModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare sender_name: string;
  declare sender_email: string;
  declare reply_to_email: string | null;
  declare default_utm_source: string;
  declare default_utm_medium: string;
  declare default_consent_text: string;
  declare status: "active" | "inactive";
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): MarketingSettings {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      sender_name: row.sender_name,
      sender_email: row.sender_email,
      reply_to_email: row.reply_to_email ?? null,
      default_utm_source: row.default_utm_source ?? "email",
      default_utm_medium: row.default_utm_medium ?? "marketing",
      default_consent_text: row.default_consent_text ?? "",
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let marketingSettingsModelPromise: Promise<typeof MarketingSettingsModel> | null = null;

export async function getMarketingSettingsModel(): Promise<typeof MarketingSettingsModel> {
  if ((MarketingSettingsModel as any).initialized) {
    return MarketingSettingsModel;
  }
  if (!marketingSettingsModelPromise) {
    marketingSettingsModelPromise = initMarketingSettingsModel().catch((error) => {
      marketingSettingsModelPromise = null;
      throw error;
    });
  }
  return marketingSettingsModelPromise;
}

async function initMarketingSettingsModel(): Promise<typeof MarketingSettingsModel> {
  const sequelize = await getSequelizeInstance();

  {
    MarketingSettingsModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        sender_name: { type: DataTypes.STRING(160), allowNull: false },
        sender_email: { type: DataTypes.STRING(160), allowNull: false },
        reply_to_email: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        default_utm_source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "email" },
        default_utm_medium: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "marketing" },
        default_consent_text: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
        status: { type: DataTypes.ENUM("active", "inactive", "deleted"), allowNull: false, defaultValue: "active" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "MarketingSettings",
        tableName: "marketing_settings",
        timestamps: false,
        underscored: true,
      },
    );

    (MarketingSettingsModel as any).initialized = true;
  }
  return MarketingSettingsModel;
}

export default async function MarketingSettingsModelFactory() {
  return getMarketingSettingsModel();
}
