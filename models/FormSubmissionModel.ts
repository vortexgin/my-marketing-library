import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type FormSubmission = {
  uuid: string;
  organization_id: string | null;
  form_id: string;
  landing_page_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  sanitized_data: Record<string, unknown>;
  consent_snapshot: Record<string, unknown>;
  visitor_id: string | null;
  utm_snapshot: Record<string, unknown>;
  submitted_at: string;
};

export type FormSubmissionModelAttributes = Partial<Omit<FormSubmission, "submitted_at">> & {
  submitted_at: Date;
};

export type FormSubmissionModelCreationAttributes = Partial<FormSubmissionModelAttributes>;

export class FormSubmissionModel extends Model<FormSubmissionModelAttributes, FormSubmissionModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare form_id: string;
  declare landing_page_id: string | null;
  declare campaign_id: string | null;
  declare lead_id: string | null;
  declare sanitized_data: Record<string, unknown>;
  declare consent_snapshot: Record<string, unknown>;
  declare visitor_id: string | null;
  declare utm_snapshot: Record<string, unknown>;
  declare submitted_at: Date;

  static toApi(row: any): FormSubmission {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      form_id: row.form_id,
      landing_page_id: row.landing_page_id ?? null,
      campaign_id: row.campaign_id ?? null,
      lead_id: row.lead_id ?? null,
      sanitized_data: (row.sanitized_data ?? {}) as Record<string, unknown>,
      consent_snapshot: (row.consent_snapshot ?? {}) as Record<string, unknown>,
      visitor_id: row.visitor_id ?? null,
      utm_snapshot: (row.utm_snapshot ?? {}) as Record<string, unknown>,
      submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : new Date().toISOString(),
    };
  }
}

let formSubmissionModelPromise: Promise<typeof FormSubmissionModel> | null = null;

export async function getFormSubmissionModel(): Promise<typeof FormSubmissionModel> {
  if ((FormSubmissionModel as any).initialized) {
    return FormSubmissionModel;
  }
  if (!formSubmissionModelPromise) {
    formSubmissionModelPromise = initFormSubmissionModel().catch((error) => {
      formSubmissionModelPromise = null;
      throw error;
    });
  }
  return formSubmissionModelPromise;
}

async function initFormSubmissionModel(): Promise<typeof FormSubmissionModel> {
  const sequelize = await getSequelizeInstance();

  {
    FormSubmissionModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        form_id: { type: DataTypes.UUID, allowNull: false },
        landing_page_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        lead_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        sanitized_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        consent_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        visitor_id: { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
        utm_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
        submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        modelName: "FormSubmission",
        tableName: "marketing_form_submissions",
        timestamps: false,
        underscored: true,
      },
    );

    (FormSubmissionModel as any).initialized = true;
  }
  return FormSubmissionModel;
}

export default async function FormSubmissionModelFactory() {
  return getFormSubmissionModel();
}
