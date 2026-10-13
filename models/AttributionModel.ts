import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type Attribution = {
  uuid: string;
  organization_id: string | null;
  visitor_id: string | null;
  normalized_email: string | null;
  campaign_id: string | null;
  campaign_run_id: string | null;
  landing_page_id: string | null;
  lead_id: string | null;
  customer_id: string | null;
  touch_type: "first" | "last";
  source: string;
  medium: string;
  campaign_value: string;
  touch_event_type: "click" | "landing_view" | "form_submit";
  touched_at: string;
  created_at: string;
};

export type AttributionModelAttributes = Partial<Omit<Attribution, "touched_at" | "created_at">> & {
  touched_at: Date;
  created_at: Date;
};

export type AttributionModelCreationAttributes = Partial<AttributionModelAttributes>;

export class AttributionModel extends Model<AttributionModelAttributes, AttributionModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare visitor_id: string | null;
  declare normalized_email: string | null;
  declare campaign_id: string | null;
  declare campaign_run_id: string | null;
  declare landing_page_id: string | null;
  declare lead_id: string | null;
  declare customer_id: string | null;
  declare touch_type: "first" | "last";
  declare source: string;
  declare medium: string;
  declare campaign_value: string;
  declare touch_event_type: "click" | "landing_view" | "form_submit";
  declare touched_at: Date;
  declare created_at: Date;

  static toApi(row: any): Attribution {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      visitor_id: row.visitor_id ?? null,
      normalized_email: row.normalized_email ?? null,
      campaign_id: row.campaign_id ?? null,
      campaign_run_id: row.campaign_run_id ?? null,
      landing_page_id: row.landing_page_id ?? null,
      lead_id: row.lead_id ?? null,
      customer_id: row.customer_id ?? null,
      touch_type: row.touch_type,
      source: row.source ?? "",
      medium: row.medium ?? "",
      campaign_value: row.campaign_value ?? "",
      touch_event_type: row.touch_event_type,
      touched_at: row.touched_at ? new Date(row.touched_at).toISOString() : new Date().toISOString(),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}

let attributionModelPromise: Promise<typeof AttributionModel> | null = null;

export async function getAttributionModel(): Promise<typeof AttributionModel> {
  if ((AttributionModel as any).initialized) {
    return AttributionModel;
  }
  if (!attributionModelPromise) {
    attributionModelPromise = initAttributionModel().catch((error) => {
      attributionModelPromise = null;
      throw error;
    });
  }
  return attributionModelPromise;
}

async function initAttributionModel(): Promise<typeof AttributionModel> {
  const sequelize = await getSequelizeInstance();

  {
    AttributionModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        visitor_id: { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
        normalized_email: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_run_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        landing_page_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        lead_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        customer_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        touch_type: { type: DataTypes.ENUM("first", "last"), allowNull: false },
        source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
        medium: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
        campaign_value: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
        touch_event_type: { type: DataTypes.ENUM("click", "landing_view", "form_submit"), allowNull: false },
        touched_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        modelName: "Attribution",
        tableName: "marketing_attributions",
        timestamps: false,
        underscored: true,
      },
    );

    (AttributionModel as any).initialized = true;
  }
  return AttributionModel;
}

export default async function AttributionModelFactory() {
  return getAttributionModel();
}
