import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type SegmentScope = "leads" | "customers" | "both";

export type Segment = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  contact_scope: SegmentScope;
  rules: Record<string, unknown>;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SegmentModelAttributes = Partial<Omit<Segment, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type SegmentModelCreationAttributes = Partial<SegmentModelAttributes>;

export class SegmentModel extends Model<SegmentModelAttributes, SegmentModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string | null;
  declare contact_scope: SegmentScope;
  declare rules: Record<string, unknown>;
  declare status: "active" | "inactive";
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): Segment {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      name: row.name,
      description: row.description ?? null,
      contact_scope: row.contact_scope,
      rules: (row.rules ?? {}) as Record<string, unknown>,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let segmentModelPromise: Promise<typeof SegmentModel> | null = null;

export async function getSegmentModel(): Promise<typeof SegmentModel> {
  if ((SegmentModel as any).initialized) {
    return SegmentModel;
  }
  if (!segmentModelPromise) {
    segmentModelPromise = initSegmentModel().catch((error) => {
      segmentModelPromise = null;
      throw error;
    });
  }
  return segmentModelPromise;
}

async function initSegmentModel(): Promise<typeof SegmentModel> {
  const sequelize = await getSequelizeInstance();

  {
    SegmentModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name: { type: DataTypes.STRING(160), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        contact_scope: { type: DataTypes.ENUM("leads", "customers", "both"), allowNull: false, defaultValue: "both" },
        rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        status: { type: DataTypes.ENUM("active", "inactive", "deleted"), allowNull: false, defaultValue: "active" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "Segment",
        tableName: "marketing_segments",
        timestamps: false,
        underscored: true,
      },
    );

    (SegmentModel as any).initialized = true;
  }
  return SegmentModel;
}

export default async function SegmentModelFactory() {
  return getSegmentModel();
}
