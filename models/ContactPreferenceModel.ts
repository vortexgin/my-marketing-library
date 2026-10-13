import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type ContactPreferenceStatus = "opted_in" | "opted_out" | "suppressed";
export type ConsentSource = "form" | "import" | "manual" | "system";

export type ContactPreference = {
  uuid: string;
  organization_id: string | null;
  normalized_email: string;
  status: ContactPreferenceStatus;
  consent_source: ConsentSource;
  consent_at: string | null;
  consent_evidence: string | null;
  unsubscribed_at: string | null;
  suppression_reason: string | null;
  last_import_batch_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContactPreferenceModelAttributes = Partial<Omit<ContactPreference, "created_at" | "updated_at" | "deleted_at" | "consent_at" | "unsubscribed_at">> & {
  consent_at: Date | null;
  unsubscribed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ContactPreferenceModelCreationAttributes = Partial<ContactPreferenceModelAttributes>;

export class ContactPreferenceModel extends Model<ContactPreferenceModelAttributes, ContactPreferenceModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare normalized_email: string;
  declare status: ContactPreferenceStatus;
  declare consent_source: ConsentSource;
  declare consent_at: Date | null;
  declare consent_evidence: string | null;
  declare unsubscribed_at: Date | null;
  declare suppression_reason: string | null;
  declare last_import_batch_id: string | null;
  declare created_by: string | null;
  declare updated_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): ContactPreference {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      normalized_email: row.normalized_email,
      status: row.status,
      consent_source: row.consent_source,
      consent_at: row.consent_at ? new Date(row.consent_at).toISOString() : null,
      consent_evidence: row.consent_evidence ?? null,
      unsubscribed_at: row.unsubscribed_at ? new Date(row.unsubscribed_at).toISOString() : null,
      suppression_reason: row.suppression_reason ?? null,
      last_import_batch_id: row.last_import_batch_id ?? null,
      created_by: row.created_by ?? null,
      updated_by: row.updated_by ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let contactPreferenceModelPromise: Promise<typeof ContactPreferenceModel> | null = null;

export async function getContactPreferenceModel(): Promise<typeof ContactPreferenceModel> {
  if ((ContactPreferenceModel as any).initialized) {
    return ContactPreferenceModel;
  }
  if (!contactPreferenceModelPromise) {
    contactPreferenceModelPromise = initContactPreferenceModel().catch((error) => {
      contactPreferenceModelPromise = null;
      throw error;
    });
  }
  return contactPreferenceModelPromise;
}

async function initContactPreferenceModel(): Promise<typeof ContactPreferenceModel> {
  const sequelize = await getSequelizeInstance();

  {
    ContactPreferenceModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        normalized_email: { type: DataTypes.STRING(160), allowNull: false },
        status: { type: DataTypes.ENUM("opted_in", "opted_out", "suppressed"), allowNull: false, defaultValue: "opted_in" },
        consent_source: { type: DataTypes.ENUM("form", "import", "manual", "system"), allowNull: false, defaultValue: "manual" },
        consent_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        consent_evidence: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        unsubscribed_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        suppression_reason: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        last_import_batch_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        created_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        updated_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "ContactPreference",
        tableName: "marketing_contact_preferences",
        timestamps: false,
        underscored: true,
      },
    );

    (ContactPreferenceModel as any).initialized = true;
  }
  return ContactPreferenceModel;
}

export default async function ContactPreferenceModelFactory() {
  return getContactPreferenceModel();
}
