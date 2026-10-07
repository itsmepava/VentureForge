import { useState, type FormEvent } from "react";
import {
  useGetSourcingDesk,
  useCreateSourcingMandate,
  useUpdateSourcingMandate,
  useStartSourcingScan,
  useSaveSourcingProvider,
  useDeleteSourcingProvider,
  useUpdateSourcingProspect,
  getGetSourcingDeskQueryKey,
  type SourcingCriteria,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Radar,
  LoaderCircle,
  Download,
  ExternalLink,
  Plus,
  ChevronDown,
} from "lucide-react";

type Evidence = {
  id: string;
  title: string;
  url: string;
  text: string;
  publishedAt: string | null;
  observedAt: string;
};
type Fact = { value: string; sourceId: string; quote: string };
type Mandate = {
  id: string;
  name: string;
  criteria: SourcingCriteria;
  daily: boolean;
  next_scan_at: string;
};
type Run = {
  id: string;
  mandate_id: string;
  mandate_snapshot: Mandate;
  status: string;
  progress: string;
  evidence: Evidence[];
  search_calls: number;
  model_calls: number;
  tokens: number;
  added: number;
  duplicates: number;
  errors: string[];
  started_at: string;
};
type Prospect = {
  id: string;
  mandate_id: string;
  name: string;
  domain: string;
  status: string;
  notes: string;
  dossier: {
    website: string;
    facts: Record<string, Fact>;
    checks: {
      criterion: string;
      result: string;
      quote: string;
      sourceId: string;
    }[];
    gaps: string[];
    evidence: Evidence[];
    researchedAt: string;
  };
};
const labels: Record<keyof SourcingCriteria, string> = {
  geographies: "Headquarters geographies",
  sectors: "Sectors",
  stages: "Funding stages",
  businessModels: "Business models",
  signals: "Required growth signals",
  exclusions: "Exclude",
};
const placeholders: Record<keyof SourcingCriteria, string> = {
  geographies: "Worldwide if blank; e.g. India, United Kingdom",
  sectors: "e.g. fintech, climate technology",
  stages: "Any if blank; e.g. Seed, Series A",
  businessModels: "Any if blank; e.g. B2B, B2C",
  signals: "e.g. paying customers, hiring",
  exclusions: "e.g. cryptocurrency, consultancies",
};
const statusLabel = (value: string) =>
  ({
    ready: "Ready to call",
    needs_review: "Needs verification",
    not_a_fit: "Does not fit",
    contacted: "Contacted",
    dismissed: "Dismissed",
    needs_provider: "Research model needed",
  })[value] ?? value.replaceAll("_", " ");
const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm";
const buttonClass =
  "rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50";
const secondaryClass =
  "rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold disabled:opacity-50";
function displayError(error: unknown) {
  const err = error as { data?: { error?: string }; message?: string };
  return err.data?.error ?? err.message ?? "Action failed. Please retry.";
}

export default function SourcingPage() {
  const client = useQueryClient();
  const desk = useGetSourcingDesk({
    query: { queryKey: getGetSourcingDeskQueryKey(), refetchInterval: 5000 },
  });
  const create = useCreateSourcingMandate();
  const edit = useUpdateSourcingMandate();
  const scan = useStartSourcingScan();
  const saveProvider = useSaveSourcingProvider();
  const removeProvider = useDeleteSourcingProvider();
  const update = useUpdateSourcingProspect();
  const mandates = (desk.data?.mandates ?? []) as unknown as Mandate[];
  const runs = (desk.data?.runs ?? []) as unknown as Run[];
  const prospects = (desk.data?.prospects ?? []) as unknown as Prospect[];
  const [showMandate, setShowMandate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [daily, setDaily] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [model, setModel] = useState("openrouter/free");
  const [providerOpen, setProviderOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [mandateFilter, setMandateFilter] = useState("all");
  const refresh = () =>
    client.invalidateQueries({ queryKey: getGetSourcingDeskQueryKey() });
  const fail = (error: unknown) => setError(displayError(error));
  const openMandate = (mandate?: Mandate) => {
    setEditing(mandate?.id ?? null);
    setName(mandate?.name ?? "");
    setDaily(mandate?.daily ?? false);
    setFields(
      mandate
        ? Object.fromEntries(
            Object.entries(mandate.criteria).map(([key, list]) => [
              key,
              list.join(", "),
            ]),
          )
        : {},
    );
    setShowMandate(true);
  };
  const submitMandate = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const criteria = Object.fromEntries(
      Object.keys(labels).map((key) => [
        key,
        (fields[key] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ]),
    ) as unknown as SourcingCriteria;
    const data = { name, daily, criteria };
    const options = {
      onSuccess: () => {
        setShowMandate(false);
        setNotice("Investment mandate saved.");
        refresh();
      },
      onError: fail,
    };
    if (editing) edit.mutate({ id: editing, data }, options);
    else create.mutate({ data }, options);
  };
  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    saveProvider.mutate(
      { data: { apiKey: key, model } },
      {
        onSuccess: () => {
          setKey("");
          setProviderOpen(false);
          setNotice(
            "Research provider saved securely. Run a scan to verify it.",
          );
          refresh();
        },
        onError: fail,
      },
    );
  };
  const filtered = prospects.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (mandateFilter === "all" || item.mandate_id === mandateFilter),
  );
  return (
    <main className="mx-auto max-w-7xl p-5 sm:p-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Your automated sourcing desk
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Find your next conversation.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
            Set your investment criteria. VentureForge searches, researches and
            saves prospects with the evidence you need to decide who to call.
          </p>
        </div>
        <button className={buttonClass} onClick={() => openMandate()}>
          <Plus size={14} className="mr-2 inline" /> New mandate
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-900"
        >
          {notice}
        </div>
      )}
      {desk.isError && (
        <div role="alert" className="mb-5 rounded-lg border p-4">
          Could not load your sourcing desk.{" "}
          <button onClick={() => desk.refetch()} className={secondaryClass}>
            Retry
          </button>
        </div>
      )}
      <section className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Research provider</h2>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {desk.data?.provider.configured
                ? `Configured: ${desk.data.provider.model}. Each scan records reported token usage.`
                : "Web discovery works without a key. Company extraction and assessment need your own OpenRouter key."}
            </p>
          </div>
          <button
            className={secondaryClass}
            onClick={() => setProviderOpen(!providerOpen)}
          >
            {desk.data?.provider.configured
              ? "Manage provider"
              : "Configure research"}
          </button>
        </div>
        {providerOpen && (
          <form
            onSubmit={submitProvider}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="text-xs font-bold">
              OpenRouter API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
                minLength={10}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-bold">
              Free model
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                required
                className={inputClass}
              />
            </label>
            <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))] sm:col-span-2">
              The key is encrypted locally and never returned to the browser.
              Research sends your mandate and public search evidence to
              OpenRouter. This milestone accepts free models only; availability
              and provider limits apply.
            </p>
            <div className="flex gap-2">
              <button disabled={saveProvider.isPending} className={buttonClass}>
                Save provider
              </button>
              {desk.data?.provider.configured && (
                <button
                  type="button"
                  disabled={removeProvider.isPending}
                  className={secondaryClass}
                  onClick={() =>
                    removeProvider.mutate(undefined, {
                      onSuccess: () => {
                        refresh();
                        setNotice(
                          "Stored provider removed. Environment configuration, if present, still applies.",
                        );
                      },
                      onError: fail,
                    })
                  }
                >
                  Remove stored key
                </button>
              )}
            </div>
          </form>
        )}
      </section>
      {showMandate && (
        <form
          onSubmit={submitMandate}
          className="mb-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
        >
          <h2 className="mb-4 font-bold">
            {editing ? "Edit investment mandate" : "New investment mandate"}
          </h2>
          <label className="text-xs font-bold">
            Mandate name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              className={inputClass}
              placeholder="e.g. Early-stage climate companies"
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Object.entries(labels).map(([key, label]) => (
              <label key={key} className="text-xs font-bold">
                {label}
                <input
                  value={fields[key] ?? ""}
                  onChange={(event) =>
                    setFields({ ...fields, [key]: event.target.value })
                  }
                  required={key === "sectors"}
                  className={inputClass}
                  placeholder={placeholders[key as keyof SourcingCriteria]}
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
            Separate entries with commas. Geography, sector, stage and business
            model accept alternatives. Every required signal and exclusion must
            be satisfied. Blank optional fields place no restriction.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={daily}
              onChange={(event) => setDaily(event.target.checked)}
            />{" "}
            Scan automatically every 24 hours while this app is running
          </label>
          <div className="mt-5 flex gap-2">
            <button
              disabled={create.isPending || edit.isPending}
              className={buttonClass}
            >
              Save mandate
            </button>
            <button
              type="button"
              onClick={() => setShowMandate(false)}
              className={secondaryClass}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <section className="mb-7">
        <h2 className="mb-3 text-lg font-bold">Investment mandates</h2>
        {desk.isLoading ? (
          <p>Loading your desk…</p>
        ) : !mandates.length ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-7">
            <h3 className="font-bold">Start with what you invest in.</h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Create a mandate to discover companies automatically. No sample
              companies are added.
            </p>
            <button
              className={`${buttonClass} mt-4`}
              onClick={() => openMandate()}
            >
              Create your first mandate
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {mandates.map((mandate) => {
              const busy = runs.some(
                (run) =>
                  run.mandate_id === mandate.id &&
                  ["queued", "running"].includes(run.status),
              );
              return (
                <article
                  key={mandate.id}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
                >
                  <h3 className="font-bold">{mandate.name}</h3>
                  <p className="mt-2 text-sm">
                    {mandate.criteria.sectors.join(", ")} ·{" "}
                    {mandate.criteria.geographies.join(", ") || "Worldwide"}
                  </p>
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {mandate.daily
                      ? `Daily scan enabled · next due ${new Date(mandate.next_scan_at).toLocaleString()}`
                      : "Scan on demand"}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      className={buttonClass}
                      disabled={busy || scan.isPending}
                      onClick={() => {
                        setError("");
                        scan.mutate(
                          { id: mandate.id },
                          {
                            onSuccess: () => {
                              setNotice(
                                "Scan queued. You can leave this page while research continues.",
                              );
                              refresh();
                            },
                            onError: fail,
                          },
                        );
                      }}
                    >
                      {busy ? (
                        <LoaderCircle
                          size={14}
                          className="mr-2 inline animate-spin"
                        />
                      ) : (
                        <Radar size={14} className="mr-2 inline" />
                      )}
                      {busy ? "Scanning…" : "Scan now"}
                    </button>
                    <button
                      className={secondaryClass}
                      onClick={() => openMandate(mandate)}
                    >
                      Edit criteria
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section id="desk-activity" className="mb-7">
        <details
          open={runs.some((run) =>
            ["queued", "running", "needs_provider", "failed"].includes(
              run.status,
            ),
          )}
        >
          <summary className="mb-3 cursor-pointer text-lg font-bold">
            Scan history ({runs.length}, latest 20){" "}
            <ChevronDown size={15} className="inline" />
          </summary>
          <div className="space-y-3">
            {!runs.length && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Your first scan will appear here with progress, source evidence
                and usage.
              </p>
            )}
            {runs.map((run) => (
              <article
                key={run.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-bold">
                    {run.mandate_snapshot.name}
                  </h3>
                  <span className="text-xs capitalize">
                    {statusLabel(run.status)} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm">{run.progress}</p>
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  {run.search_calls} search requests · {run.model_calls} model
                  requests · {run.tokens} reported tokens · {run.added} new ·{" "}
                  {run.duplicates} updated
                </p>
                {run.errors.map((message, index) => (
                  <p key={index} className="mt-2 text-xs text-red-700">
                    {message}
                  </p>
                ))}
                {!!run.evidence.length && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Discovery and research evidence ({run.evidence.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {run.evidence.map((source) => (
                        <div
                          key={source.id}
                          className="border-l-2 border-[hsl(var(--border))] pl-3"
                        >
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold underline"
                          >
                            {source.title || source.url}
                          </a>
                          <p className="mt-1 text-xs">{source.text}</p>
                          <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                            Published: {source.publishedAt || "unknown"} ·
                            fetched{" "}
                            {new Date(source.observedAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
          </div>
        </details>
      </section>
      <section id="contact-queue">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Your contact queue</h2>
          <a
            href={`${import.meta.env.VITE_API_BASE_URL || ""}/api/sourcing/export.csv`}
            className={secondaryClass}
          >
            <Download size={14} className="mr-2 inline" /> Export all prospects
          </a>
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            aria-label="Filter prospects by status"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className={secondaryClass}
          >
            {[
              "all",
              "ready",
              "needs_review",
              "not_a_fit",
              "contacted",
              "dismissed",
            ].map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All prospects" : statusLabel(status)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter prospects by mandate"
            value={mandateFilter}
            onChange={(event) => setMandateFilter(event.target.value)}
            className={secondaryClass}
          >
            <option value="all">All mandates</option>
            {mandates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="self-center text-xs text-[hsl(var(--muted-foreground))]">
            Showing {filtered.length} of the latest 200 prospects
          </span>
        </div>
        <p className="mb-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
          Readiness is a model assessment backed by search excerpts, not an
          independent fact check. Check dates and sources before calling.
          Missing facts and uncertain investment criteria stay visible.
        </p>
        {!filtered.length && (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">
            No prospects in this view yet. Run a mandate scan with a research
            model configured to build your queue.
          </div>
        )}
        <div className="space-y-4">
          {filtered.map((prospect) => (
            <ProspectCard
              key={prospect.id}
              prospect={prospect}
              pending={update.isPending}
              onSave={(status, notes) =>
                update.mutate(
                  { id: prospect.id, data: { status, notes } },
                  {
                    onSuccess: () => {
                      refresh();
                      setNotice("Call outcome saved.");
                    },
                    onError: fail,
                  },
                )
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}
function ProspectCard({
  prospect,
  pending,
  onSave,
}: {
  prospect: Prospect;
  pending: boolean;
  onSave: (
    status: "contacted" | "dismissed" | "needs_review",
    notes: string,
  ) => void;
}) {
  const [notes, setNotes] = useState(prospect.notes);
  const dossier = prospect.dossier;
  return (
    <article className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{prospect.name}</h3>
          <a
            href={dossier.website}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline"
          >
            {prospect.domain} <ExternalLink size={12} className="inline" />
          </a>
        </div>
        <span className="h-fit rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-xs font-semibold">
          {statusLabel(prospect.status)}
        </span>
      </div>
      <p className="mt-3 text-sm">
        {dossier.facts.description?.value ||
          "Company description needs verification."}
      </p>
      <p className="mt-2 text-xs">
        Founders: {dossier.facts.founders?.value || "Unknown"} · Contact:{" "}
        {dossier.facts.contact?.value || "Not found"}
      </p>
      {!!dossier.gaps.length && (
        <p className="mt-3 text-xs text-amber-800">
          {dossier.gaps.join(" · ")}
        </p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-bold">
          Company brief, criteria and sources
        </summary>
        <dl className="mt-4 space-y-3">
          {Object.entries(dossier.facts).map(([key, fact]) => {
            const source = dossier.evidence.find(
              (item) => item.id === fact.sourceId,
            );
            return (
              <div key={key}>
                <dt className="text-xs font-bold capitalize">{key}</dt>
                <dd className="mt-1 text-sm">{fact.value}</dd>
                {source && (
                  <dd className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {source.title}
                    </a>{" "}
                    — “{fact.quote}”
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
        <div className="mt-4 space-y-2">
          {dossier.checks.map((check) => (
            <div key={check.criterion} className="text-xs">
              <strong>{check.result.toUpperCase()}</strong> · {check.criterion}
              {check.quote && (
                <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                  “{check.quote}”
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
          Last researched {new Date(dossier.researchedAt).toLocaleString()}
        </p>
      </details>
      <label className="mt-4 block text-xs font-bold">
        Call notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={5000}
          className="mt-2 min-h-20 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] p-3 text-sm"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => onSave("contacted", notes)}
          className={buttonClass}
        >
          Record call
        </button>
        <button
          disabled={pending}
          onClick={() => onSave("dismissed", notes)}
          className={secondaryClass}
        >
          Dismiss
        </button>
        <button
          disabled={pending}
          onClick={() => onSave("needs_review", notes)}
          className={secondaryClass}
        >
          Save notes / needs verification
        </button>
      </div>
    </article>
  );
}
