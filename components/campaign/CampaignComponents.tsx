"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { Campaign } from "@/app/marketing/models/CampaignModel";
import type { MarketingTemplate } from "@/app/marketing/models/MarketingTemplateModel";
import type { Segment } from "@/app/marketing/models/SegmentModel";
import type { CampaignRun } from "@/app/marketing/models/CampaignRunModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/campaigns";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", field: "name" },
  { key: "status", label: "Status", field: "status" },
  { key: "scheduled_at", label: "Scheduled", field: "scheduled_at" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<Campaign[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch campaigns.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete campaign.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderCell(column: TableColumn, _row: TableRow, value: unknown) {
  if (column.key === "status") {
    return value ? <StatusBadge status={String(value)} /> : undefined;
  }
  if ((column.key === "scheduled_at" || column.key === "created_at") && value) {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  if (column.key === "scheduled_at") {
    return <span className="text-slate-400">—</span>;
  }
  return undefined;
}

export function CampaignTable({ session }: { session: SessionInfo }) {
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [draftQuery, setDraftQuery] = useState("");
  const [draftStatus, setDraftStatus] = useState("");

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (draftQuery.trim()) {
      next["filter[q]"] = draftQuery.trim();
    }
    if (draftStatus) {
      next["filter[status]"] = draftStatus;
    }
    setApplied(next);
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search campaigns..." aria-label="Search campaigns" />
        <SelectField
          aria-label="Filter by status"
          value={draftStatus}
          onChange={(event) => setDraftStatus(event.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "draft" },
            { value: "scheduled", label: "scheduled" },
            { value: "running", label: "running" },
            { value: "paused", label: "paused" },
            { value: "completed", label: "completed" },
            { value: "cancelled", label: "cancelled" },
          ]}
        />
        <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Filter
        </button>
      </form>
      <div className="mt-4">
        <Table
          session={session}
          columns={COLUMNS}
          fetchRows={fetchRows}
          basePath="/marketing/views/campaigns"
          extraParams={applied}
          actionUpdate={["marketing:campaign:view:update"]}
          actionDelete={["marketing:campaign:view:delete"]}
          onDelete={deleteRow}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}

export function CampaignForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<Campaign, "name" | "description" | "objective" | "template_id" | "segment_id" | "budget" | "utm_source" | "utm_medium" | "utm_campaign">;
}) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [templateResult, segmentResult] = await Promise.allSettled([
        getEncrypted<MarketingTemplate[]>("/marketing/api/v1/templates?limit=100&sortProperty=name&sortDirection=asc"),
        getEncrypted<Segment[]>("/marketing/api/v1/segments?limit=100&sortProperty=name&sortDirection=asc"),
      ]);
      if (!active) {
        return;
      }
      if (templateResult.status === "fulfilled" && templateResult.value.success) {
        setTemplates(templateResult.value.data ?? []);
      } else {
        setOptionsError("Could not load templates.");
      }
      if (segmentResult.status === "fulfilled" && segmentResult.value.success) {
        setSegments(segmentResult.value.data ?? []);
      } else {
        setOptionsError("Could not load segments.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const budgetRaw = String(formData.get("budget") ?? "").trim();
      const payload = {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        objective: String(formData.get("objective") ?? "") || null,
        template_id: String(formData.get("template_id") ?? ""),
        segment_id: String(formData.get("segment_id") ?? ""),
        budget: budgetRaw === "" ? null : Math.trunc(Number(budgetRaw)),
        utm_source: String(formData.get("utm_source") ?? "") || undefined,
        utm_medium: String(formData.get("utm_medium") ?? "") || undefined,
        utm_campaign: String(formData.get("utm_campaign") ?? "") || null,
      };
      const envelope =
        mode === "create"
          ? await postEncrypted<Campaign>(API_PATH, payload)
          : await putEncrypted<Campaign>(`${API_PATH}/${uuid}`, payload);
      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} campaign.`);
        return;
      }
      window.location.href = mode === "create" ? "/marketing/views/campaigns" : `/marketing/views/campaigns/${uuid}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-5">
      <TextField label="Name" type="text" name="name" required minLength={2} maxLength={160} defaultValue={initial?.name ?? ""} />
      <TextAreaField label="Description" name="description" rows={2} maxLength={2000} defaultValue={initial?.description ?? ""} />
      <TextAreaField label="Objective" name="objective" rows={2} maxLength={2000} defaultValue={initial?.objective ?? ""} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          label="Template"
          name="template_id"
          required
          defaultValue={initial?.template_id ?? ""}
          options={templates.filter((row) => row.status === "active").map((row) => ({ value: row.uuid, label: row.name }))}
        />
        <SelectField
          label="Segment"
          name="segment_id"
          required
          defaultValue={initial?.segment_id ?? ""}
          options={segments.filter((row) => row.status === "active").map((row) => ({ value: row.uuid, label: row.name }))}
        />
      </div>
      {optionsError ? (
        <p role="alert" className="text-sm text-red-700">{optionsError}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <TextField label="Budget" type="number" name="budget" min={0} defaultValue={initial?.budget ?? ""} placeholder="Optional" />
        <TextField label="UTM source" type="text" name="utm_source" maxLength={80} defaultValue={initial?.utm_source ?? "email"} />
        <TextField label="UTM medium" type="text" name="utm_medium" maxLength={80} defaultValue={initial?.utm_medium ?? "marketing"} />
      </div>
      <TextField label="UTM campaign" type="text" name="utm_campaign" maxLength={160} defaultValue={initial?.utm_campaign ?? ""} placeholder="Defaults to campaign name" />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Saving..." : mode === "create" ? "Create campaign" : "Save changes"}
      </button>
    </form>
  );
}

export function CampaignRunPanel({ campaignUuid }: { campaignUuid: string }) {
  const [preview, setPreview] = useState<null | Record<string, unknown>>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [runResult, setRunResult] = useState<null | { run: CampaignRun; eligible_count: number }>(null);

  async function runGuarded(label: string, call: () => Promise<{ success: boolean; message?: string; data?: unknown }>, onData?: (data: unknown) => void) {
    if (pending) {
      return;
    }
    setError("");
    setMessage("");
    setPending(true);
    try {
      const envelope = await call();
      if (!envelope.success) {
        setError(envelope.message || `${label} failed.`);
        return;
      }
      if (onData) {
        onData(envelope.data);
      }
      setMessage(`${label} done.`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Audience, schedule & runs</h2>
      {error ? (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-green-700">{message}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => runGuarded("Preview", () => postEncrypted(`${API_PATH}/${campaignUuid}/preview`, {}), (data) => setPreview((data ?? {}) as Record<string, unknown>))}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Preview audience
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => runGuarded("Run start", () => postEncrypted<{ run: CampaignRun; eligible_count: number }>(`${API_PATH}/${campaignUuid}/runs`, {}), (data) => setRunResult(data as { run: CampaignRun; eligible_count: number }))}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          Start run
        </button>
      </div>
      {preview ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {Object.entries(preview)
            .filter(([key]) => key !== "sample")
            .map(([key, value]) => (
              <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{key}</dt>
                <dd className="font-semibold tabular-nums">{String(value ?? "—")}</dd>
              </div>
            ))}
        </dl>
      ) : null}
      {runResult ? (
        <p role="status" className="text-sm text-slate-700">
          Run {runResult.run.uuid.slice(0, 8)} queued · {runResult.eligible_count} recipients ·{" "}
          <a className="text-blue-700 hover:underline" href={`/marketing/views/campaigns/runs/${runResult.run.uuid}`}>Open run</a>
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runGuarded("Schedule", () => postEncrypted(`${API_PATH}/${campaignUuid}/schedule`, { scheduled_at: scheduleAt }));
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-52">
          <TextField label="Schedule (org-local)" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} required />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Schedule
        </button>
      </form>
    </div>
  );
}

export function RunActionsPanel({ runUuid, status }: { runUuid: string; status: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function transition(action: "pause" | "resume" | "cancel") {
    if (pending) {
      return;
    }
    setError("");
    setMessage("");
    setPending(true);
    try {
      const envelope = await postEncrypted<CampaignRun>(`/marketing/api/v1/campaign-runs/${runUuid}/${action}`, {});
      if (!envelope.success) {
        setError(envelope.message || `${action} failed.`);
        return;
      }
      setMessage(`Run ${action}d. Refresh to see the new state.`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Run controls</h2>
      <p className="mt-1 text-xs text-slate-500">Status: {status}. Pause stops new claims; cancel marks unclaimed messages cancelled.</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-green-700">{message}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => transition("pause")} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
          Pause
        </button>
        <button type="button" onClick={() => transition("resume")} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
          Resume
        </button>
        <button type="button" onClick={() => transition("cancel")} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60">
          Cancel
        </button>
      </div>
    </div>
  );
}
