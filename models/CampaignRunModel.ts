import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CampaignRunStatus = "preparing" | "queued" | "running" | "paused" | "completed" | "cancelled" | "billing_exhausted" | "failed";

export type CampaignRun = {
  uuid: string;
  organization_id: string | null;
  campaign_id: string;
  status: CampaignRunStatus;
  organization_timezone: string;
  sender_snapshot: Record<string, unknown>;
  template_snapshot: Record<string, unknown>;
  utm_snapshot: Record<string, unknown>;
  segment_rules_snapshot: Record<string, unknown>;
  audience_count: number;
  eligible_count: number;
  excluded_counts: Record<string, number>;
  campaign_billed_at: string | null;
  initiated_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CampaignRunModelAttributes = Partial<Omit<CampaignRun, "created_at" | "updated_at" | "deleted_at" | "campaign_billed_at" | "started_at" | "completed_at">> & {
  campaign_billed_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CampaignRunModelCreationAttributes = Partial<CampaignRunModelAttributes>;

export class CampaignRunModel extends Model<CampaignRunModelAttributes, CampaignRunModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_id: string;
  declare status: CampaignRunStatus;
  declare organization_timezone: string;
  declare sender_snapshot: Record<string, unknown>;
  declare template_snapshot: Record<string, unknown>;
  declare utm_snapshot: Record<string, unknown>;
  declare segment_rules_snapshot: Record<string, unknown>;
  declare audience_count: number;
  declare eligible_count: number;
  declare excluded_counts: Record<string, number>;
  declare campaign_billed_at: Date | null;
  declare initiated_by: string | null;
  declare started_at: Date | null;
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): CampaignRun {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_id: row.campaign_id,
      status: row.status,
      organization_timezone: row.organization_timezone ?? "Asia/Jakarta",
      sender_snapshot: (row.sender_snapshot ?? {}) as Record<string, unknown>,
      template_snapshot: (row.template_snapshot ?? {}) as Record<string, unknown>,
      utm_snapshot: (row.utm_snapshot ?? {}) as Record<string, unknown>,
      segment_rules_snapshot: (row.segment_rules_snapshot ?? {}) as Record<string, unknown>,
      audience_count: row.audience_count ?? 0,
      eligible_count: row.eligible_count ?? 0,
      excluded_counts: (row.excluded_counts ?? {}) as Record<string, number>,
      campaign_billed_at: row.campaign_billed_at ? new Date(row.campaign_billed_at).toISOString() : null,
      initiated_by: row.initiated_by ?? null,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let campaignRunModelPromise: Promise<typeof CampaignRunModel> | null = null;

export async function getCampaignRunModel(): Promise<typeof CampaignRunModel> {
  if ((CampaignRunModel as any).initialized) {
    return CampaignRunModel;
  }
  if (!campaignRunModelPromise) {
    campaignRunModelPromise = initCampaignRunModel().catch((error) => {
      campaignRunModelPromise = null;
      throw error;
    });
  }
  return campaignRunModelPromise;
}

async function initCampaignRunModel(): Promise<typeof CampaignRunModel> {
  const sequelize = await getSequelizeInstance();

  {
    CampaignRunModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: false },
        status: { type: DataTypes.ENUM("preparing", "queued", "running", "paused", "completed", "cancelled", "failed", "billing_exhausted"), allowNull: false, defaultValue: "preparing" },
        organization_timezone: { type: DataTypes.STRING(100), allowNull: false, defaultValue: "Asia/Jakarta" },
        sender_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        template_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        utm_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        segment_rules_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        audience_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        eligible_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        excluded_counts: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        campaign_billed_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        initiated_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        started_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        completed_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "CampaignRun",
        tableName: "marketing_campaign_runs",
        timestamps: false,
        underscored: true,
      },
    );

    (CampaignRunModel as any).initialized = true;
  }
  return CampaignRunModel;
}

export default async function CampaignRunModelFactory() {
  return getCampaignRunModel();
}
