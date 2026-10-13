"use client";

import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { MarketingForm } from "@/app/marketing/models/MarketingFormModel";
import type { FormSubmission } from "@/app/marketing/models/FormSubmissionModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/forms";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", field: "name" },
  { key: "status", label: "Status", field: "status" },
  { key: "created_at", label: "Created", field: "created_at" },
];

const SUBMISSION_COLUMNS: TableColumn[] = [
  { key: "submitted_at", label: "Submitted", field: "submitted_at" },
  { key: "lead_id", label: "Lead", field: "lead_id" },
  { key: "campaign_id", label: "Campaign", field: "campaign_id" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<MarketingForm[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch forms.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete form.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderCell(column: TableColumn, _row: TableRow, value: unknown) {
  if (column.key === "status") {
    return value ? <StatusBadge status={String(value)} /> : undefined;
  }
  if ((column.key === "created_at" || column.key === "submitted_at") && value) {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  if (typeof value === "string" && value) {
    return <span className="font-mono text-xs">{value.slice(0, 8)}</span>;
  }
  return <span className="text-slate-400">—</span>;
}

export function MarketingFormTable({ session }: { session: SessionInfo }) {
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [draftQuery, setDraftQuery] = useState("");

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(draftQuery.trim() ? { "filter[q]": draftQuery.trim() } : {});
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 flex gap-3">
        <div className="flex-1">
          <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search forms..." aria-label="Search forms" />
        </div>
        <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Filter
        </button>
      </form>
      <div className="mt-4">
        <Table
          session={session}
          columns={COLUMNS}
          fetchRows={fetchRows}
          basePath="/marketing/views/forms"
          extraParams={applied}
          actionUpdate={["marketing:form:view:update"]}
          actionDelete={["marketing:form:view:delete"]}
          onDelete={deleteRow}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}

const DEFAULT_FIELDS = `{
  "fields": [
    { "key": "name", "label": "Full name", "required": true },
    { "key": "email", "label": "Email", "required": true },
    { "key": "phone_number", "label": "Phone", "required": false },
    { "key": "company", "label": "Company", "required": false },
    { "key": "message", "label": "Message", "required": false },
    { "key": "consent", "label": "Contact consent", "required": true }
  ]
}`;

export function MarketingFormBuilder({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<MarketingForm, "name" | "fields" | "consent_text" | "success_message" | "redirect_url" | "status">;
}) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      let fields: unknown;
      try {
        fields = JSON.parse(String(formData.get("fields") ?? "{}"));
      } catch {
        setError("Fields must be valid JSON.");
        return;
      }
      const payload = {
        name: String(formData.get("name") ?? ""),
        fields,
        consent_text: String(formData.get("consent_text") ?? ""),
        success_message: String(formData.get("success_message") ?? ""),
        redirect_url: String(formData.get("redirect_url") ?? "") || null,
        status: String(formData.get("status") ?? "active"),
      };
      const envelope =
        mode === "create"
          ? await postEncrypted<MarketingForm>(API_PATH, payload)
          : await putEncrypted<MarketingForm>(`${API_PATH}/${uuid}`, payload);
      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} form.`);
        return;
      }
      window.location.href = mode === "create" ? "/marketing/views/forms" : `/marketing/views/forms/${uuid}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-5">
      <TextField label="Name" type="text" name="name" required minLength={2} maxLength={160} defaultValue={initial?.name ?? ""} />
      <TextAreaField
        label="Fields (JSON)"
        name="fields"
        rows={12}
        required
        defaultValue={initial ? JSON.stringify(initial.fields, null, 2) : DEFAULT_FIELDS}
        hint="Keys: name, email (required), phone_number, company, message, consent, metadata (+metadata_field/metadata_name)."
      />
      <TextAreaField label="Consent text" name="consent_text" rows={2} maxLength={2000} defaultValue={initial?.consent_text ?? ""} />
      <TextField label="Success message" type="text" name="success_message" required maxLength={500} defaultValue={initial?.success_message ?? "Thank you."} />
      <TextField label="Redirect URL" type="text" name="redirect_url" maxLength={2000} defaultValue={initial?.redirect_url ?? ""} placeholder="Optional https:// URL" />
      <SelectField
        label="Status"
        name="status"
        defaultValue={initial?.status ?? "active"}
        options={[
          { value: "active", label: "active" },
          { value: "inactive", label: "inactive" },
        ]}
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {isPending ? "Saving..." : mode === "create" ? "Create form" : "Save changes"}
      </button>
    </form>
  );
}

async function fetchSubmissions(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<FormSubmission[]>(`/marketing/api/v1/form-submissions?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch submissions.");
  }
  return (envelope.data ?? []) as TableRow[];
}

export function FormSubmissionsTable({ session, formUuid }: { session: SessionInfo; formUuid: string }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">Submissions</h2>
      <div className="mt-3">
        <Table
          session={session}
          columns={SUBMISSION_COLUMNS}
          fetchRows={fetchSubmissions}
          basePath="/marketing/views/forms"
          extraParams={{ "filter[form_id]": formUuid }}
          actionUpdate={[]}
          actionDelete={[]}
          hideManage
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}
