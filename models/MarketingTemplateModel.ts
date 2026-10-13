import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MarketingTemplate = {
  uuid: string;
  organization_id: string | null;
  name: string;
  subject: string;
  preview_text: string | null;
  html_body: string;
  text_body: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MarketingTemplateModelAttributes = Partial<Omit<MarketingTemplate, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type MarketingTemplateModelCreationAttributes = Partial<MarketingTemplateModelAttributes>;

export class MarketingTemplateModel extends Model<MarketingTemplateModelAttributes, MarketingTemplateModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare subject: string;
  declare preview_text: string | null;
  declare html_body: string;
  declare text_body: string;
  declare status: "active" | "inactive";
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): MarketingTemplate {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      name: row.name,
      subject: row.subject,
      preview_text: row.preview_text ?? null,
      html_body: row.html_body,
      text_body: row.text_body,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let marketingTemplateModelPromise: Promise<typeof MarketingTemplateModel> | null = null;

export async function getMarketingTemplateModel(): Promise<typeof MarketingTemplateModel> {
  if ((MarketingTemplateModel as any).initialized) {
    return MarketingTemplateModel;
  }
  if (!marketingTemplateModelPromise) {
    marketingTemplateModelPromise = initMarketingTemplateModel().catch((error) => {
      marketingTemplateModelPromise = null;
      throw error;
    });
  }
  return marketingTemplateModelPromise;
}

async function initMarketingTemplateModel(): Promise<typeof MarketingTemplateModel> {
  const sequelize = await getSequelizeInstance();

  {
    MarketingTemplateModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name: { type: DataTypes.STRING(160), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: false },
        preview_text: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
        html_body: { type: DataTypes.TEXT, allowNull: false },
        text_body: { type: DataTypes.TEXT, allowNull: false },
        status: { type: DataTypes.ENUM("active", "inactive", "deleted"), allowNull: false, defaultValue: "active" },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "MarketingTemplate",
        tableName: "marketing_templates",
        timestamps: false,
        underscored: true,
      },
    );

    (MarketingTemplateModel as any).initialized = true;
  }
  return MarketingTemplateModel;
}

export default async function MarketingTemplateModelFactory() {
  return getMarketingTemplateModel();
}
