import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type MessageAttemptOutcome = "accepted" | "transient_failure" | "permanent_failure" | "billing_blocked";

export type MessageAttempt = {
  uuid: string;
  message_id: string;
  attempt_no: number;
  outcome: MessageAttemptOutcome;
  provider_message_id: string | null;
  error_code: string | null;
  error_summary: string | null;
  attempted_at: string;
};

export type MessageAttemptModelAttributes = Partial<Omit<MessageAttempt, "attempted_at">> & {
  attempted_at: Date;
};

export type MessageAttemptModelCreationAttributes = Partial<MessageAttemptModelAttributes>;

export class MessageAttemptModel extends Model<MessageAttemptModelAttributes, MessageAttemptModelCreationAttributes> {
  declare uuid: string;
  declare message_id: string;
  declare attempt_no: number;
  declare outcome: MessageAttemptOutcome;
  declare provider_message_id: string | null;
  declare error_code: string | null;
  declare error_summary: string | null;
  declare attempted_at: Date;

  static toApi(row: any): MessageAttempt {
    return {
      uuid: row.uuid,
      message_id: row.message_id,
      attempt_no: row.attempt_no,
      outcome: row.outcome,
      provider_message_id: row.provider_message_id ?? null,
      error_code: row.error_code ?? null,
      error_summary: row.error_summary ?? null,
      attempted_at: row.attempted_at ? new Date(row.attempted_at).toISOString() : new Date().toISOString(),
    };
  }
}

let messageAttemptModelPromise: Promise<typeof MessageAttemptModel> | null = null;

export async function getMessageAttemptModel(): Promise<typeof MessageAttemptModel> {
  if ((MessageAttemptModel as any).initialized) {
    return MessageAttemptModel;
  }
  if (!messageAttemptModelPromise) {
    messageAttemptModelPromise = initMessageAttemptModel().catch((error) => {
      messageAttemptModelPromise = null;
      throw error;
    });
  }
  return messageAttemptModelPromise;
}

async function initMessageAttemptModel(): Promise<typeof MessageAttemptModel> {
  const sequelize = await getSequelizeInstance();

  {
    MessageAttemptModel.init(
      {
        uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
        message_id: { type: DataTypes.UUID, allowNull: false },
        attempt_no: { type: DataTypes.INTEGER, allowNull: false },
        outcome: { type: DataTypes.ENUM("accepted", "transient_failure", "permanent_failure", "billing_blocked"), allowNull: false },
        provider_message_id: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
        error_code: { type: DataTypes.STRING(80), allowNull: true, defaultValue: null },
        error_summary: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
        attempted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        modelName: "MessageAttempt",
        tableName: "marketing_message_attempts",
        timestamps: false,
        underscored: true,
      },
    );

    (MessageAttemptModel as any).initialized = true;
  }
  return MessageAttemptModel;
}

export default async function MessageAttemptModelFactory() {
  return getMessageAttemptModel();
}
