import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type ConsentImportBatch = {
  uuid: string;
  organization_id: string | null;
  imported_by: string | null;
  source: string;
  row_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  status: "completed" | "failed";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ConsentImportBatchModelAttributes = Partial<Omit<ConsentImportBatch, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ConsentImportBatchModelCreationAttributes = Partial<ConsentImportBatchModelAttributes>;

export class ConsentImportBatchModel extends Model<ConsentImportBatchModelAttributes, ConsentImportBatchModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare imported_by: string | null;
  declare source: string;
  declare row_count: number;
  declare created_count: number;
  declare updated_count: number;
  declare skipped_count: number;
  declare status: "completed" | "failed";
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): ConsentImportBatch {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      imported_by: row.imported_by ?? null,
      source: row.source ?? "",
      row_count: row.row_count ?? 0,
      created_count: row.created_count ?? 0,
      updated_count: row.updated_count ?? 0,
      skipped_count: row.skipped_count ?? 0,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let consentImportBatchModelPromise: Promise<typeof ConsentImportBatchModel> | null = null;

export async function getConsentImportBatchModel(): Promise<typeof ConsentImportBatchModel> {
  if ((ConsentImportBatchModel as any).initialized) {
    return ConsentImportBatchModel;
  }
  if (!consentImportBatchModelPromise) {
    consentImportBatchModelPromise = initConsentImportBatchModel().catch((error) => {
      consentImportBatchModelPromise = null;
      throw error;
    });
  }
  return consentImportBatchModelPromise;
}

async function initConsentImportBatchModel(): Promise<typeof ConsentImportBatchModel> {
  const sequelize = await getSequelizeInstance();

  {
    ConsentImportBatchModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        imported_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        source: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
        row_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        created_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        updated_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        skipped_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: DataTypes.ENUM("completed", "failed"), allowNull: false, defaultValue: "completed" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "ConsentImportBatch",
        tableName: "marketing_consent_import_batches",
        timestamps: false,
        underscored: true,
      },
    );

    (ConsentImportBatchModel as any).initialized = true;
  }
  return ConsentImportBatchModel;
}

export default async function ConsentImportBatchModelFactory() {
  return getConsentImportBatchModel();
}
