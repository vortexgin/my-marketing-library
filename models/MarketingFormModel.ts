import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MarketingForm = {
  uuid: string;
  organization_id: string | null;
  name: string;
  fields: Record<string, unknown>;
  consent_text: string;
  success_message: string;
  redirect_url: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MarketingFormModelAttributes = Partial<Omit<MarketingForm, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type MarketingFormModelCreationAttributes = Partial<MarketingFormModelAttributes>;

export class MarketingFormModel extends Model<MarketingFormModelAttributes, MarketingFormModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare fields: Record<string, unknown>;
  declare consent_text: string;
  declare success_message: string;
  declare redirect_url: string | null;
  declare status: "active" | "inactive";
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): MarketingForm {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      name: row.name,
      fields: (row.fields ?? { fields: [] }) as Record<string, unknown>,
      consent_text: row.consent_text ?? "",
      success_message: row.success_message ?? "",
      redirect_url: row.redirect_url ?? null,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let marketingFormModelPromise: Promise<typeof MarketingFormModel> | null = null;

export async function getMarketingFormModel(): Promise<typeof MarketingFormModel> {
  if ((MarketingFormModel as any).initialized) {
    return MarketingFormModel;
  }
  if (!marketingFormModelPromise) {
    marketingFormModelPromise = initMarketingFormModel().catch((error) => {
      marketingFormModelPromise = null;
      throw error;
    });
  }
  return marketingFormModelPromise;
}

async function initMarketingFormModel(): Promise<typeof MarketingFormModel> {
  const sequelize = await getSequelizeInstance();

  {
    MarketingFormModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name: { type: DataTypes.STRING(160), allowNull: false },
        fields: { type: DataTypes.JSONB, allowNull: false, defaultValue: { fields: [] } },
        consent_text: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
        success_message: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
        redirect_url: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
        status: { type: DataTypes.ENUM("active", "inactive", "deleted"), allowNull: false, defaultValue: "active" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "MarketingForm",
        tableName: "marketing_forms",
        timestamps: false,
        underscored: true,
      },
    );

    (MarketingFormModel as any).initialized = true;
  }
  return MarketingFormModel;
}

export default async function MarketingFormModelFactory() {
  return getMarketingFormModel();
}
