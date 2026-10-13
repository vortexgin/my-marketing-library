"use client";

import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { Segment } from "@/app/marketing/models/SegmentModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/segments";

const COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", field: "name" },
  { key: "contact_scope", label: "Scope", field: "contact_scope" },
  { key: "status", label: "Status", field: "status" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<Segment[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch segments.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete segment.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderCell(column: TableColumn, _row: TableRow, value: unknown) {
  if (column.key === "status") {
    return value ? <StatusBadge status={String(value)} /> : undefined;
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function SegmentTable({ session }: { session: SessionInfo }) {
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
          <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search segments..." aria-label="Search segments" />
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
          basePath="/marketing/views/segments"
          extraParams={applied}
          actionUpdate={["marketing:segment:view:update"]}
          actionDelete={["marketing:segment:view:delete"]}
          onDelete={deleteRow}
          renderCell={renderCell}
        />
      </div>
    </div>
  );
}

const DEFAULT_RULES = `{
  "operator": "and",
  "rules": [
    { "field": "consent.status", "operator": "eq", "value": "opted_in" }
  ]
}`;

export function SegmentForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<Segment, "name" | "description" | "contact_scope" | "rules" | "status">;
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
      let rules: unknown;
      try {
        rules = JSON.parse(String(formData.get("rules") ?? "{}"));
      } catch {
        setError("Rules must be valid JSON.");
        return;
      }
      const payload = {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        contact_scope: String(formData.get("contact_scope") ?? "both"),
        rules,
        status: String(formData.get("status") ?? "active"),
      };
      const envelope =
        mode === "create"
          ? await postEncrypted<Segment>(API_PATH, payload)
          : await putEncrypted<Segment>(`${API_PATH}/${uuid}`, payload);
      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} segment.`);
        return;
      }
      window.location.href = mode === "create" ? "/marketing/views/segments" : `/marketing/views/segments/${uuid}`;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-2xl space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField label="Name" type="text" name="name" required minLength={2} maxLength={160} defaultValue={initial?.name ?? ""} />
        <SelectField
          label="Contact scope"
          name="contact_scope"
          defaultValue={initial?.contact_scope ?? "both"}
          options={[
            { value: "leads", label: "Leads" },
            { value: "customers", label: "Customers" },
            { value: "both", label: "Both" },
          ]}
        />
      </div>
      <TextField label="Description" type="text" name="description" maxLength={2000} defaultValue={initial?.description ?? ""} />
      <TextAreaField
        label="Rules (JSON)"
        name="rules"
        rows={10}
        required
        defaultValue={initial ? JSON.stringify(initial.rules, null, 2) : DEFAULT_RULES}
        hint="Validated tree: and/or branches (depth ≤ 4, ≤ 20 rules), allowlisted fields only."
      />
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
        {isPending ? "Saving..." : mode === "create" ? "Create segment" : "Save changes"}
      </button>
    </form>
  );
}

export function SegmentPreviewPanel({ uuid }: { uuid: string }) {
  const [result, setResult] = useState<null | Record<string, unknown>>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePreview() {
    if (loading) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const envelope = await postEncrypted<Record<string, unknown>>(`${API_PATH}/${uuid}/preview`, {});
      if (!envelope.success) {
        setError(envelope.message || "Preview failed.");
        return;
      }
      setResult(envelope.data ?? {});
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Audience preview</h2>
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Run preview"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
      ) : null}
      {result ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {Object.entries(result)
            .filter(([key]) => key !== "sample")
            .map(([key, value]) => (
              <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{key}</dt>
                <dd className="font-semibold tabular-nums">{String(value ?? "—")}</dd>
              </div>
            ))}
        </dl>
      ) : null}
      {Array.isArray((result as { sample?: unknown[] } | null)?.sample) && ((result as { sample: unknown[] }).sample.length > 0) ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {(result as { sample: Array<{ normalized_email: string; name: string; status: string }> }).sample.slice(0, 10).map((row) => (
            <li key={row.normalized_email}>{row.name} · {row.normalized_email} · {row.status}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
