import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type TrackedLink = {
  uuid: string;
  organization_id: string | null;
  campaign_id: string | null;
  campaign_run_id: string | null;
  message_id: string | null;
  token_hash: string;
  destination_url: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TrackedLinkModelAttributes = Partial<Omit<TrackedLink, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type TrackedLinkModelCreationAttributes = Partial<TrackedLinkModelAttributes>;

export class TrackedLinkModel extends Model<TrackedLinkModelAttributes, TrackedLinkModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_id: string | null;
  declare campaign_run_id: string | null;
  declare message_id: string | null;
  declare token_hash: string;
  declare destination_url: string;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): TrackedLink {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_id: row.campaign_id ?? null,
      campaign_run_id: row.campaign_run_id ?? null,
      message_id: row.message_id ?? null,
      token_hash: row.token_hash,
      destination_url: row.destination_url,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let trackedLinkModelPromise: Promise<typeof TrackedLinkModel> | null = null;

export async function getTrackedLinkModel(): Promise<typeof TrackedLinkModel> {
  if ((TrackedLinkModel as any).initialized) {
    return TrackedLinkModel;
  }
  if (!trackedLinkModelPromise) {
    trackedLinkModelPromise = initTrackedLinkModel().catch((error) => {
      trackedLinkModelPromise = null;
      throw error;
    });
  }
  return trackedLinkModelPromise;
}

async function initTrackedLinkModel(): Promise<typeof TrackedLinkModel> {
  const sequelize = await getSequelizeInstance();

  {
    TrackedLinkModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_run_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        message_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        token_hash: { type: DataTypes.STRING(128), allowNull: false },
        destination_url: { type: DataTypes.STRING(2000), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "TrackedLink",
        tableName: "marketing_tracked_links",
        timestamps: false,
        underscored: true,
      },
    );

    (TrackedLinkModel as any).initialized = true;
  }
  return TrackedLinkModel;
}

export default async function TrackedLinkModelFactory() {
  return getTrackedLinkModel();
}
