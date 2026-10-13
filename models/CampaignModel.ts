import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";

export type Campaign = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  objective: string | null;
  template_id: string;
  segment_id: string;
  owner_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  budget: number | null;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CampaignModelAttributes = Partial<Omit<Campaign, "created_at" | "updated_at" | "deleted_at" | "scheduled_at">> & {
  scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CampaignModelCreationAttributes = Partial<CampaignModelAttributes>;

export class CampaignModel extends Model<CampaignModelAttributes, CampaignModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string | null;
  declare objective: string | null;
  declare template_id: string;
  declare segment_id: string;
  declare owner_id: string | null;
  declare status: CampaignStatus;
  declare scheduled_at: Date | null;
  declare budget: number | null;
  declare utm_source: string;
  declare utm_medium: string;
  declare utm_campaign: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): Campaign {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      name: row.name,
      description: row.description ?? null,
      objective: row.objective ?? null,
      template_id: row.template_id,
      segment_id: row.segment_id,
      owner_id: row.owner_id ?? null,
      status: row.status,
      scheduled_at: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      budget: typeof row.budget === "number" ? row.budget : null,
      utm_source: row.utm_source ?? "email",
      utm_medium: row.utm_medium ?? "marketing",
      utm_campaign: row.utm_campaign ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let campaignModelPromise: Promise<typeof CampaignModel> | null = null;

export async function getCampaignModel(): Promise<typeof CampaignModel> {
  if ((CampaignModel as any).initialized) {
    return CampaignModel;
  }
  if (!campaignModelPromise) {
    campaignModelPromise = initCampaignModel().catch((error) => {
      campaignModelPromise = null;
      throw error;
    });
  }
  return campaignModelPromise;
}

async function initCampaignModel(): Promise<typeof CampaignModel> {
  const sequelize = await getSequelizeInstance();

  {
    CampaignModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name: { type: DataTypes.STRING(160), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        objective: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        template_id: { type: DataTypes.UUID, allowNull: false },
        segment_id: { type: DataTypes.UUID, allowNull: false },
        owner_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        status: { type: DataTypes.ENUM("draft", "scheduled", "running", "paused", "completed", "cancelled"), allowNull: false, defaultValue: "draft" },
        scheduled_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        budget: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
        utm_source: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "email" },
        utm_medium: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "marketing" },
        utm_campaign: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "Campaign",
        tableName: "marketing_campaigns",
        timestamps: false,
        underscored: true,
      },
    );

    (CampaignModel as any).initialized = true;
  }
  return CampaignModel;
}

export default async function CampaignModelFactory() {
  return getCampaignModel();
}
