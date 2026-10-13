import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LandingPageStatus = "draft" | "published" | "unpublished";

export type LandingPage = {
  uuid: string;
  organization_id: string | null;
  campaign_id: string | null;
  form_id: string | null;
  name: string;
  organization_slug: string;
  slug: string;
  title: string;
  seo_description: string | null;
  content: Record<string, unknown>;
  status: LandingPageStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LandingPageModelAttributes = Partial<Omit<LandingPage, "created_at" | "updated_at" | "deleted_at" | "published_at">> & {
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LandingPageModelCreationAttributes = Partial<LandingPageModelAttributes>;

export class LandingPageModel extends Model<LandingPageModelAttributes, LandingPageModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_id: string | null;
  declare form_id: string | null;
  declare name: string;
  declare organization_slug: string;
  declare slug: string;
  declare title: string;
  declare seo_description: string | null;
  declare content: Record<string, unknown>;
  declare status: LandingPageStatus;
  declare published_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): LandingPage {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_id: row.campaign_id ?? null,
      form_id: row.form_id ?? null,
      name: row.name,
      organization_slug: row.organization_slug,
      slug: row.slug,
      title: row.title,
      seo_description: row.seo_description ?? null,
      content: (row.content ?? { blocks: [] }) as Record<string, unknown>,
      status: row.status,
      published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let landingPageModelPromise: Promise<typeof LandingPageModel> | null = null;

export async function getLandingPageModel(): Promise<typeof LandingPageModel> {
  if ((LandingPageModel as any).initialized) {
    return LandingPageModel;
  }
  if (!landingPageModelPromise) {
    landingPageModelPromise = initLandingPageModel().catch((error) => {
      landingPageModelPromise = null;
      throw error;
    });
  }
  return landingPageModelPromise;
}

async function initLandingPageModel(): Promise<typeof LandingPageModel> {
  const sequelize = await getSequelizeInstance();

  {
    LandingPageModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        form_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        name: { type: DataTypes.STRING(160), allowNull: false },
        organization_slug: { type: DataTypes.STRING(120), allowNull: false },
        slug: { type: DataTypes.STRING(120), allowNull: false },
        title: { type: DataTypes.STRING(200), allowNull: false },
        seo_description: { type: DataTypes.STRING(300), allowNull: true, defaultValue: null },
        content: { type: DataTypes.JSONB, allowNull: false, defaultValue: { blocks: [] } },
        status: { type: DataTypes.ENUM("draft", "published", "unpublished", "deleted"), allowNull: false, defaultValue: "draft" },
        published_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "LandingPage",
        tableName: "marketing_landing_pages",
        timestamps: false,
        underscored: true,
      },
    );

    (LandingPageModel as any).initialized = true;
  }
  return LandingPageModel;
}

export default async function LandingPageModelFactory() {
  return getLandingPageModel();
}
