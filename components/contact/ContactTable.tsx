"use client";

import { useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { ContactPreference } from "@/app/marketing/models/ContactPreferenceModel";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextField } from "@/components/FormField";

const API_PATH = "/marketing/api/v1/contact-preferences";

const COLUMNS: TableColumn[] = [
  { key: "normalized_email", label: "Email", field: "normalized_email" },
  { key: "status", label: "Status", field: "status" },
  { key: "consent_source", label: "Source", field: "consent_source" },
  { key: "updated_at", label: "Updated", field: "updated_at" },
];

async function fetchRows(params: URLSearchParams): Promise<TableRow[]> {
  const envelope = await getEncrypted<ContactPreference[]>(`${API_PATH}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch contacts.");
  }
  return (envelope.data ?? []) as TableRow[];
}

function renderCell(column: TableColumn, _row: TableRow, value: unknown) {
  if (column.key === "status") {
    return value ? <StatusBadge status={String(value)} /> : undefined;
  }
  if (column.key === "updated_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function ContactTable({ session }: { session: SessionInfo }) {
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [draftQuery, setDraftQuery] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [editing, setEditing] = useState<ContactPreference | null>(null);
  const [editStatus, setEditStatus] = useState<"opted_in" | "opted_out">("opted_in");
  const [editEvidence, setEditEvidence] = useState("");
  const [editError, setEditError] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || editPending) {
      return;
    }
    setEditError("");
    setEditPending(true);
    try {
      const envelope = await putEncrypted<ContactPreference>(`${API_PATH}/${editing.uuid}`, {
        status: editStatus,
        consent_evidence: editEvidence.trim() || null,
      });
      if (!envelope.success) {
        setEditError(envelope.message || "Failed to update preference.");
        return;
      }
      setEditing(null);
      setEditEvidence("");
      setRefreshKey((key) => key + 1);
    } catch {
      setEditError("Something went wrong. Please try again.");
    } finally {
      setEditPending(false);
    }
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Search email..." aria-label="Search email" />
        <SelectField
          aria-label="Filter by status"
          value={draftStatus}
          onChange={(event) => setDraftStatus(event.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "opted_in", label: "opted_in" },
            { value: "opted_out", label: "opted_out" },
            { value: "suppressed", label: "suppressed" },
          ]}
        />
        <button type="submit" className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">
          Filter
        </button>
      </form>

      <div className="mt-4" key={refreshKey}>
        <Table
          session={session}
          columns={COLUMNS}
          fetchRows={fetchRows}
          basePath="/marketing/views/contact-preferences"
          extraParams={applied}
          actionUpdate={[]}
          actionDelete={[]}
          hideManage
          renderCell={renderCell}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Manual preference change</h2>
        <p className="mt-1 text-xs text-slate-500">Search above, then paste the contact UUID to re-opt-in (evidence required) or opt out. Suppressed addresses stay system-owned.</p>
        <form onSubmit={handleUpdate} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_1fr_auto]">
          <TextField
            aria-label="Contact UUID"
            type="text"
            value={editing?.uuid ?? ""}
            onChange={(event) => setEditing(event.target.value.trim() ? ({ uuid: event.target.value.trim() } as ContactPreference) : null)}
            placeholder="Contact UUID"
          />
          <SelectField
            aria-label="New status"
            value={editStatus}
            onChange={(event) => setEditStatus(event.target.value as "opted_in" | "opted_out")}
            options={[
              { value: "opted_in", label: "opted_in" },
              { value: "opted_out", label: "opted_out" },
            ]}
          />
          <TextField aria-label="Evidence" type="text" value={editEvidence} onChange={(event) => setEditEvidence(event.target.value)} placeholder="Evidence reference" />
          <button type="submit" disabled={editPending || !editing} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
            {editPending ? "Saving..." : "Apply"}
          </button>
        </form>
        {editError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">{editError}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ContactImportPanel() {
  const [csv, setCsv] = useState("email,status,consent_at,source,evidence\n");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<null | {
    row_count: number; valid: number; duplicates_in_file: number; already_opted_out: number; suppressed: number; invalid: number;
    skipped: Array<{ index: number; email: string; reason: string }>;
  }>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function parseCsv(): Array<Record<string, string>> {
    const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return [];
    }
    const headers = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? "").trim();
      });
      return row;
    });
  }

  async function handlePreview() {
    if (pending) {
      return;
    }
    setError("");
    setMessage("");
    setPending(true);
    try {
      const envelope = await postEncrypted<typeof preview>(`${API_PATH}/import/preview`, { rows: parseCsv() });
      if (!envelope.success) {
        setError(envelope.message || "Preview failed.");
        return;
      }
      setPreview(envelope.data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleImport() {
    if (pending) {
      return;
    }
    setError("");
    setMessage("");
    setPending(true);
    try {
      const envelope = await postEncrypted<{ created: number; updated: number; skipped: unknown[] }>(`${API_PATH}/import`, {
        source: source.trim() || undefined,
        rows: parseCsv(),
      });
      if (!envelope.success) {
        setError(envelope.message || "Import failed.");
        return;
      }
      setMessage(`Imported: ${envelope.data?.created ?? 0} created, ${envelope.data?.updated ?? 0} updated, ${(envelope.data?.skipped ?? []).length} skipped.`);
      setPreview(null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Consent import (CSV → JSON, client-side, max 500 rows)</h2>
      <textarea
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
        rows={6}
        aria-label="Consent CSV"
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-xs outline-none focus:border-blue-500"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="w-56">
          <TextField aria-label="Batch source" type="text" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Batch source (optional)" />
        </div>
        <button type="button" onClick={handlePreview} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
          {pending ? "Working..." : "Preview"}
        </button>
        <button type="button" onClick={handleImport} disabled={pending} className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
          {pending ? "Working..." : "Import"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm text-green-700">{message}</p>
      ) : null}
      {preview ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {(["row_count", "valid", "duplicates_in_file", "already_opted_out", "suppressed", "invalid"] as const).map((key) => (
            <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{key}</dt>
              <dd className="font-semibold tabular-nums">{preview[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {preview && preview.skipped.length > 0 ? (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
          {preview.skipped.map((row) => (
            <li key={`${row.index}-${row.email}`}>row {row.index + 1} · {row.email || "—"} · {row.reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
