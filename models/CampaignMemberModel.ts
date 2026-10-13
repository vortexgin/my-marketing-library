import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CampaignMemberStatus = "eligible" | "excluded" | "queued" | "accepted" | "delivered" | "failed" | "cancelled";

export type CampaignMember = {
  uuid: string;
  organization_id: string | null;
  campaign_run_id: string;
  normalized_email: string;
  contact_type: "lead" | "customer";
  lead_id: string | null;
  customer_id: string | null;
  name_snapshot: string;
  email_snapshot: string;
  company_snapshot: string | null;
  consent_snapshot: Record<string, unknown>;
  status: CampaignMemberStatus;
  exclusion_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CampaignMemberModelAttributes = Partial<Omit<CampaignMember, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CampaignMemberModelCreationAttributes = Partial<CampaignMemberModelAttributes>;

export class CampaignMemberModel extends Model<CampaignMemberModelAttributes, CampaignMemberModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_run_id: string;
  declare normalized_email: string;
  declare contact_type: "lead" | "customer";
  declare lead_id: string | null;
  declare customer_id: string | null;
  declare name_snapshot: string;
  declare email_snapshot: string;
  declare company_snapshot: string | null;
  declare consent_snapshot: Record<string, unknown>;
  declare status: CampaignMemberStatus;
  declare exclusion_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): CampaignMember {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_run_id: row.campaign_run_id,
      normalized_email: row.normalized_email,
      contact_type: row.contact_type,
      lead_id: row.lead_id ?? null,
      customer_id: row.customer_id ?? null,
      name_snapshot: row.name_snapshot ?? "",
      email_snapshot: row.email_snapshot ?? "",
      company_snapshot: row.company_snapshot ?? null,
      consent_snapshot: (row.consent_snapshot ?? {}) as Record<string, unknown>,
      status: row.status,
      exclusion_reason: row.exclusion_reason ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let campaignMemberModelPromise: Promise<typeof CampaignMemberModel> | null = null;

export async function getCampaignMemberModel(): Promise<typeof CampaignMemberModel> {
  if ((CampaignMemberModel as any).initialized) {
    return CampaignMemberModel;
  }
  if (!campaignMemberModelPromise) {
    campaignMemberModelPromise = initCampaignMemberModel().catch((error) => {
      campaignMemberModelPromise = null;
      throw error;
    });
  }
  return campaignMemberModelPromise;
}

async function initCampaignMemberModel(): Promise<typeof CampaignMemberModel> {
  const sequelize = await getSequelizeInstance();

  {
    CampaignMemberModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_run_id: { type: DataTypes.UUID, allowNull: false },
        normalized_email: { type: DataTypes.STRING(160), allowNull: false },
        contact_type: { type: DataTypes.ENUM("lead", "customer"), allowNull: false },
        lead_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        customer_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name_snapshot: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
        email_snapshot: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
        company_snapshot: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        consent_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        status: { type: DataTypes.ENUM("eligible", "excluded", "queued", "accepted", "delivered", "failed", "cancelled"), allowNull: false, defaultValue: "eligible" },
        exclusion_reason: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "CampaignMember",
        tableName: "marketing_campaign_members",
        timestamps: false,
        underscored: true,
      },
    );

    (CampaignMemberModel as any).initialized = true;
  }
  return CampaignMemberModel;
}

export default async function CampaignMemberModelFactory() {
  return getCampaignMemberModel();
}
