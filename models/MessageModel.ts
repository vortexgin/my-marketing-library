import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MessageStatus = "queued" | "processing" | "accepted" | "delivered" | "soft_bounced" | "hard_bounced" | "complained" | "failed" | "cancelled";

export type Message = {
  uuid: string;
  organization_id: string | null;
  campaign_run_id: string;
  campaign_member_id: string;
  provider: string;
  provider_message_id: string | null;
  idempotency_key: string;
  status: MessageStatus;
  attempts: number;
  next_attempt_at: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  recipient_billed_at: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  processing_started_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MessageModelAttributes = Partial<Omit<Message, "created_at" | "updated_at" | "deleted_at" | "next_attempt_at" | "accepted_at" | "delivered_at" | "recipient_billed_at" | "processing_started_at">> & {
  next_attempt_at: Date | null;
  accepted_at: Date | null;
  delivered_at: Date | null;
  recipient_billed_at: Date | null;
  processing_started_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type MessageModelCreationAttributes = Partial<MessageModelAttributes>;

export class MessageModel extends Model<MessageModelAttributes, MessageModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare campaign_run_id: string;
  declare campaign_member_id: string;
  declare provider: string;
  declare provider_message_id: string | null;
  declare idempotency_key: string;
  declare status: MessageStatus;
  declare attempts: number;
  declare next_attempt_at: Date | null;
  declare accepted_at: Date | null;
  declare delivered_at: Date | null;
  declare recipient_billed_at: Date | null;
  declare last_error_code: string | null;
  declare last_error_summary: string | null;
  declare processing_started_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): Message {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      campaign_run_id: row.campaign_run_id,
      campaign_member_id: row.campaign_member_id,
      provider: row.provider ?? "mailgun",
      provider_message_id: row.provider_message_id ?? null,
      idempotency_key: row.idempotency_key,
      status: row.status,
      attempts: row.attempts ?? 0,
      next_attempt_at: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null,
      accepted_at: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
      delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
      recipient_billed_at: row.recipient_billed_at ? new Date(row.recipient_billed_at).toISOString() : null,
      last_error_code: row.last_error_code ?? null,
      last_error_summary: row.last_error_summary ?? null,
      processing_started_at: row.processing_started_at ? new Date(row.processing_started_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let messageModelPromise: Promise<typeof MessageModel> | null = null;

export async function getMessageModel(): Promise<typeof MessageModel> {
  if ((MessageModel as any).initialized) {
    return MessageModel;
  }
  if (!messageModelPromise) {
    messageModelPromise = initMessageModel().catch((error) => {
      messageModelPromise = null;
      throw error;
    });
  }
  return messageModelPromise;
}

async function initMessageModel(): Promise<typeof MessageModel> {
  const sequelize = await getSequelizeInstance();

  {
    MessageModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        organization_id: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
        campaign_run_id: { type: DataTypes.UUID, allowNull: false },
        campaign_member_id: { type: DataTypes.UUID, allowNull: false },
        provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "mailgun" },
        provider_message_id: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        idempotency_key: { type: DataTypes.STRING(160), allowNull: false },
        status: { type: DataTypes.ENUM("queued", "processing", "accepted", "delivered", "soft_bounced", "hard_bounced", "complained", "failed", "cancelled"), allowNull: false, defaultValue: "queued" },
        attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        next_attempt_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        accepted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        delivered_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        recipient_billed_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        last_error_code: { type: DataTypes.STRING(80), allowNull: true, defaultValue: null },
        last_error_summary: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
        processing_started_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
      },
      {
        sequelize,
        modelName: "Message",
        tableName: "marketing_messages",
        timestamps: false,
        underscored: true,
      },
    );

    (MessageModel as any).initialized = true;
  }
  return MessageModel;
}

export default async function MessageModelFactory() {
  return getMessageModel();
}
