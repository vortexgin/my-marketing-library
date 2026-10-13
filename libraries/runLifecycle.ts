import CampaignRunModelFactory, { CampaignRunModel } from "@/app/marketing/models/CampaignRunModel";
import CampaignModelFactory, { CampaignModel } from "@/app/marketing/models/CampaignModel";
import MessageModelFactory, { MessageModel } from "@/app/marketing/models/MessageModel";

/**
 * Completes a run once every message reached a terminal state, mirroring
 * the campaign lifecycle. Terminal message states: accepted, delivered,
 * soft/hard_bounced, complained, failed, cancelled. Called after worker
 * batches, pause/resume/cancel transitions, and webhook processing.
 */
export async function maybeCompleteRun(runUuid: string): Promise<boolean> {
  await CampaignRunModelFactory();
  const run = await CampaignRunModel.findOne({ where: { uuid: runUuid, deleted_at: null } });
  if (!run || !["queued", "running", "paused"].includes(run.status)) {
    return false;
  }

  await MessageModelFactory();
  const open = await MessageModel.count({
    where: { campaign_run_id: runUuid, status: ["queued", "processing"], deleted_at: null },
  });
  if (open > 0) {
    return false;
  }

  await run.update({ status: "completed", completed_at: new Date(), updated_at: new Date() });

  await CampaignModelFactory();
  const campaign = await CampaignModel.findOne({ where: { uuid: run.campaign_id, deleted_at: null } });
  if (campaign && ["running", "paused"].includes(campaign.status)) {
    await campaign.update({ status: "completed", updated_at: new Date() });
  }
  return true;
}
