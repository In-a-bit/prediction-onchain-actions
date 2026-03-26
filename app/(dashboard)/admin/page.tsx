"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  searchEvents,
  getEventBySlug,
  createEvent,
  createMarket,
  listRelayerWallets,
  createRelayerWallet,
  getSmartAccount,
  getCollateralBalance,
} from "@/lib/admin/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "events" | "relayer-wallets" | "smart-account" | "collateral";

const DEFAULT_GAMMA_URL = "http://localhost:8084";
const DEFAULT_DPM_URL = "http://localhost:8086";

const GAMMA_PRESETS = [
  { label: "Local (localhost:8084)", value: DEFAULT_GAMMA_URL },
  ...(process.env.NEXT_PUBLIC_GAMMA_API_URL
    ? [{ label: "Remote", value: process.env.NEXT_PUBLIC_GAMMA_API_URL }]
    : []),
];

const DPM_PRESETS = [
  { label: "Local (localhost:8086)", value: DEFAULT_DPM_URL },
  ...(process.env.NEXT_PUBLIC_DPM_API_URL
    ? [{ label: "Remote", value: process.env.NEXT_PUBLIC_DPM_API_URL }]
    : []),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    DEPLOYING: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    DEPLOYED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return (
    <Badge className={colors[status] || "bg-zinc-100 text-zinc-800"}>
      {status}
    </Badge>
  );
}

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  if (!value) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      {label}
    </Badge>
  );
}

function Card({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h3 className="text-lg font-semibold">{title}</h3>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
      {error}
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL Selector
// ---------------------------------------------------------------------------

function UrlSelector({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = presets.some((p) => p.value === value);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [customValue, setCustomValue] = useState(isPreset ? "" : value);

  return (
    <div className="flex-1 space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex gap-2">
        <select
          value={customMode ? "__custom__" : value}
          onChange={(e) => {
            if (e.target.value === "__custom__") {
              setCustomMode(true);
              onChange(customValue || "");
            } else {
              setCustomMode(false);
              onChange(e.target.value);
            }
          }}
          className="h-9 shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
        {customMode && (
          <Input
            placeholder="http://..."
            value={customValue}
            onChange={(e) => {
              const v = e.target.value.trim();
              setCustomValue(v);
              onChange(v);
            }}
            className="h-9 font-mono text-xs"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events Tab (search + create event + create market modal)
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function EventsTab({
  gammaUrl,
  dpmUrl,
}: {
  gammaUrl: string;
  dpmUrl: string;
}) {
  // --- Search / list state ---
  const [searchText, setSearchText] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [filterClosed, setFilterClosed] = useState("");
  const [filterArchived, setFilterArchived] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const debouncedSearch = useDebounce(searchText, 400);

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create event
  const [showCreateEvent, setShowCreateEvent] = useState(false);

  // Create market modal
  const [marketModalEvent, setMarketModalEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const fetchEvents = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      };
      if (filterActive) params.active = filterActive;
      if (filterClosed) params.closed = filterClosed;
      if (filterArchived) params.archived = filterArchived;

      const res = await searchEvents(gammaUrl, params);
      if (res.success) {
        let data = res.data;
        // Client-side text filter (gamma-api may not support text search)
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          data = data.filter((e: any) => {
            const title = (e.title || "").toLowerCase();
            const slug = (e.slug || "").toLowerCase();
            const id = (e.id || "").toLowerCase();
            return title.includes(q) || slug.includes(q) || id.includes(q);
          });
        }
        setResults(data);
        setTotal(data.length);
      } else {
        setError(res.error);
        setResults([]);
        setTotal(0);
      }
      setLoading(false);
    },
    [gammaUrl, debouncedSearch, filterActive, filterClosed, filterArchived]
  );

  useEffect(() => {
    setPage(0);
    fetchEvents(0);
  }, [fetchEvents]);

  useEffect(() => {
    fetchEvents(page);
  }, [page]);

  async function handleExpand(slug: string) {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      setEventDetail(null);
      return;
    }
    setExpandedSlug(slug);
    setDetailLoading(true);
    const res = await getEventBySlug(gammaUrl, slug);
    if (res.success) {
      setEventDetail(res.data);
    }
    setDetailLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Events list */}
      <Card
        title={`Events${total > 0 ? ` (${total})` : ""}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchEvents(page)}
              disabled={loading}
            >
              {loading ? "↻" : "⟳"} Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateEvent((s) => !s)}
            >
              {showCreateEvent ? "Hide" : "+ New Event"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Search / filter bar */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by title, slug, or ID..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            {(["active", "closed", "archived"] as const).map((key) => {
              const val =
                key === "active"
                  ? filterActive
                  : key === "closed"
                  ? filterClosed
                  : filterArchived;
              const setter =
                key === "active"
                  ? setFilterActive
                  : key === "closed"
                  ? setFilterClosed
                  : setFilterArchived;
              return (
                <select
                  key={key}
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs capitalize dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">{key}: Any</option>
                  <option value="true">{key}: Yes</option>
                  <option value="false">{key}: No</option>
                </select>
              );
            })}
          </div>

          {error && <ErrorBox error={error} />}

          {/* Results table */}
          {loading && results.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No events found
            </p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 border-b border-zinc-100 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800">
                <div className="col-span-2">ID</div>
                <div className="col-span-3">Title</div>
                <div className="col-span-2">Slug</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Flags</div>
                <div className="col-span-1">Markets</div>
                <div className="col-span-1"></div>
              </div>
              {/* Rows */}
              {results.map((event: any) => {
                const slug = event.slug || "";
                const eventId = event.id || "";
                const isExpanded = expandedSlug === slug;
                return (
                  <div key={eventId || slug}>
                    <div
                      className={`grid w-full grid-cols-12 items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors ${
                        isExpanded
                          ? "bg-zinc-100 dark:bg-zinc-800"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <button
                        onClick={() => slug && handleExpand(slug)}
                        className="col-span-2 truncate text-left font-mono text-zinc-500"
                      >
                        {eventId ? eventId.slice(0, 12) + "..." : "-"}
                      </button>
                      <button
                        onClick={() => slug && handleExpand(slug)}
                        className="col-span-3 truncate text-left font-medium"
                      >
                        {event.title || "Untitled"}
                      </button>
                      <button
                        onClick={() => slug && handleExpand(slug)}
                        className="col-span-2 truncate text-left font-mono text-zinc-500"
                      >
                        {slug || "-"}
                      </button>
                      <div className="col-span-1">
                        <StatusBadge
                          status={
                            event.deployment_status ||
                            event.deploymentStatus ||
                            (event.ready
                              ? "DEPLOYED"
                              : event.deploying
                              ? "DEPLOYING"
                              : event.pendingDeployment
                              ? "PENDING"
                              : "UNKNOWN")
                          }
                        />
                      </div>
                      <div className="col-span-2 flex flex-wrap gap-1">
                        <BoolBadge
                          value={event.active ?? event.Active}
                          label="active"
                        />
                        <BoolBadge
                          value={event.closed ?? event.Closed}
                          label="closed"
                        />
                        <BoolBadge
                          value={event.neg_risk ?? event.negRisk}
                          label="neg-risk"
                        />
                      </div>
                      <div className="col-span-1 text-zinc-500">
                        {event.markets?.length ?? "?"}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMarketModalEvent({
                              id: eventId,
                              title: event.title || "Untitled",
                            });
                          }}
                        >
                          + Market
                        </Button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mb-2 ml-4 mt-1 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        {detailLoading ? (
                          <p className="text-xs text-zinc-500">Loading...</p>
                        ) : eventDetail ? (
                          <EventDetail event={eventDetail} />
                        ) : (
                          <p className="text-xs text-zinc-500">
                            No detail available
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Create Event (collapsible) */}
      {showCreateEvent && (
        <CreateEventForm dpmUrl={dpmUrl} onCreated={() => fetchEvents(page)} />
      )}

      {/* Create Market Modal */}
      {marketModalEvent && (
        <CreateMarketModal
          dpmUrl={dpmUrl}
          eventExternalId={marketModalEvent.id}
          eventTitle={marketModalEvent.title}
          onClose={() => setMarketModalEvent(null)}
          onCreated={() => {
            fetchEvents(page);
            // Re-expand the event to show the new market
            if (expandedSlug) {
              handleExpand(expandedSlug);
              handleExpand(expandedSlug);
            }
          }}
        />
      )}
    </div>
  );
}

function EventDetail({ event }: { event: any }) {
  const markets = event.markets || event.Markets || [];
  return (
    <div className="space-y-4 text-xs">
      {/* Event info */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {[
          ["ID", event.id ?? event.ID],
          ["Slug", event.slug],
          ["Title", event.title],
          ["Ticker", event.ticker],
          ["Description", event.description],
          ["Resolution Source", event.resolution_source ?? event.resolutionSource],
          ["Start Date", event.start_date ?? event.startDate],
          ["End Date", event.end_date ?? event.endDate],
          ["Active", String(event.active)],
          ["Closed", String(event.closed)],
          ["Archived", String(event.archived)],
          ["Restricted", String(event.restricted)],
          ["Neg Risk", String(event.neg_risk ?? event.negRisk)],
          ["Neg Risk Market ID", event.neg_risk_market_id ?? event.negRiskMarketID],
          ["Deployment Status", event.deployment_status ?? event.deploymentStatus ?? (event.ready ? "DEPLOYED" : "PENDING")],
          ["Comment Count", event.comment_count ?? event.commentCount],
          ["Parent Event ID", event.parent_event_id ?? event.parentEventId],
          ["Volume", event.volume],
          ["Liquidity", event.liquidity],
        ]
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([label, value]) => (
            <div key={label as string}>
              <span className="font-medium text-zinc-500">{label}: </span>
              <span className="font-mono">{String(value)}</span>
            </div>
          ))}
      </div>

      {/* Tags */}
      {event.tags?.length > 0 && (
        <div>
          <span className="font-medium text-zinc-500">Tags: </span>
          <span className="space-x-1">
            {event.tags.map((t: any) => (
              <Badge key={t.id || t.slug} variant="secondary" className="text-xs">
                {t.label || t.slug}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {/* Markets */}
      {markets.length > 0 && (
        <div>
          <h4 className="mb-2 font-semibold">Markets ({markets.length})</h4>
          <div className="space-y-3">
            {markets.map((m: any, i: number) => (
              <div
                key={m.id || m.ID || i}
                className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-medium">
                    {m.question || m.Question || "No question"}
                  </span>
                  <StatusBadge
                    status={
                      m.deployment_status ||
                      m.deploymentStatus ||
                      (m.ready ? "DEPLOYED" : m.deploying ? "DEPLOYING" : "PENDING")
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {[
                    ["ID", m.id ?? m.ID],
                    ["External ID", m.external_id ?? m.externalId],
                    ["Condition ID", m.condition_id ?? m.conditionId],
                    ["Question ID", m.question_id ?? m.questionID],
                    ["Slug", m.slug],
                    ["Active", String(m.active)],
                    ["Closed", String(m.closed)],
                    ["Funded", String(m.funded)],
                    ["Approved", String(m.approved)],
                    ["Accepting Orders", String(m.accepting_orders ?? m.acceptingOrders)],
                    ["Activation", m.activation],
                    ["Neg Risk", String(m.neg_risk ?? m.negRisk)],
                    ["Min Tick Size", m.order_price_min_tick_size ?? m.minimumTickSize],
                    ["Min Order Size", m.order_min_size ?? m.minimumOrderSize],
                    ["RFQ Enabled", String(m.rfq_enabled ?? m.rfqEnabled)],
                  ]
                    .filter(([, v]) => v !== undefined && v !== null && v !== "")
                    .map(([label, value]) => (
                      <div key={label as string}>
                        <span className="text-zinc-500">{label}: </span>
                        <span className="font-mono">{String(value)}</span>
                      </div>
                    ))}
                </div>
                {m.outcomePrices && (
                  <div className="mt-2">
                    <span className="text-zinc-500">Prices: </span>
                    <span className="font-mono">{m.outcomePrices}</span>
                  </div>
                )}
                {m.outcomes && (
                  <div>
                    <span className="text-zinc-500">Outcomes: </span>
                    <span className="font-mono">{JSON.stringify(m.outcomes)}</span>
                  </div>
                )}
                {(m.clobTokenIds || m.clob_token_ids) && (
                  <div>
                    <span className="text-zinc-500">CLOB Token IDs: </span>
                    <span className="font-mono break-all">
                      {JSON.stringify(m.clobTokenIds || m.clob_token_ids)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Event Form (inline, collapsible)
// ---------------------------------------------------------------------------

function CreateEventForm({ dpmUrl, onCreated }: { dpmUrl: string; onCreated: () => void }) {
  const [form, setForm] = useState({
    external_id: "",
    slug: "",
    title: "",
    ticker: "",
    description: "",
    resolution_source: "",
    start_date: "",
    end_date: "",
    icon: "",
    active: "true",
    closed: "false",
    archived: "false",
    restricted: "false",
    neg_risk: "false",
    neg_risk_market_id: "",
    deployment_status: "PENDING",
    parent_event_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  function setField(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: Record<string, any> = {
      external_id: form.external_id,
      slug: form.slug,
      title: form.title,
      active: form.active === "true",
      closed: form.closed === "true",
      archived: form.archived === "true",
      restricted: form.restricted === "true",
      neg_risk: form.neg_risk === "true",
      deployment_status: form.deployment_status,
    };
    if (form.ticker) payload.ticker = form.ticker;
    if (form.description) payload.description = form.description;
    if (form.resolution_source) payload.resolution_source = form.resolution_source;
    if (form.start_date) payload.start_date = new Date(form.start_date).toISOString();
    if (form.end_date) payload.end_date = new Date(form.end_date).toISOString();
    if (form.icon) payload.icon = form.icon;
    if (form.neg_risk_market_id) payload.neg_risk_market_id = form.neg_risk_market_id;
    if (form.parent_event_id) payload.parent_event_id = parseInt(form.parent_event_id, 10);

    const res = await createEvent(dpmUrl, payload);
    if (res.success) {
      setResult(res.data);
      setForm({ external_id: "", slug: "", title: "", ticker: "", description: "", resolution_source: "", start_date: "", end_date: "", icon: "", active: "true", closed: "false", archived: "false", restricted: "false", neg_risk: "false", neg_risk_market_id: "", deployment_status: "PENDING", parent_event_id: "" });
      onCreated();
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit = form.external_id && form.slug && form.title && !loading;

  return (
    <Card title="Create Event">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-medium">External ID <span className="text-red-500">*</span></Label>
            <Input placeholder="unique-external-id" value={form.external_id} onChange={(e) => setField("external_id", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Slug <span className="text-red-500">*</span></Label>
            <Input placeholder="event-url-slug" value={form.slug} onChange={(e) => setField("slug", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Ticker</Label>
            <Input placeholder="EVENT-TICKER" value={form.ticker} onChange={(e) => setField("ticker", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium">Title <span className="text-red-500">*</span></Label>
          <Input placeholder="Event title" value={form.title} onChange={(e) => setField("title", e.target.value)} className="mt-1 h-8 text-xs" />
        </div>

        <div>
          <Label className="text-xs font-medium">Description</Label>
          <textarea placeholder="Event description" value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium">Resolution Source</Label>
            <Input placeholder="https://..." value={form.resolution_source} onChange={(e) => setField("resolution_source", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Icon URL</Label>
            <Input placeholder="https://..." value={form.icon} onChange={(e) => setField("icon", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium">Start Date</Label>
            <Input type="datetime-local" value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">End Date</Label>
            <Input type="datetime-local" value={form.end_date} onChange={(e) => setField("end_date", e.target.value)} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {([["active", "Active"], ["closed", "Closed"], ["archived", "Archived"], ["restricted", "Restricted"], ["neg_risk", "Neg Risk"]] as const).map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs font-medium">{label}</Label>
              <select value={form[key]} onChange={(e) => setField(key, e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-medium">Deployment Status</Label>
            <select value={form.deployment_status} onChange={(e) => setField("deployment_status", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
              <option value="PENDING">PENDING</option>
              <option value="DEPLOYING">DEPLOYING</option>
              <option value="DEPLOYED">DEPLOYED</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-medium">Neg Risk Market ID</Label>
            <Input placeholder="optional" value={form.neg_risk_market_id} onChange={(e) => setField("neg_risk_market_id", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Parent Event ID</Label>
            <Input placeholder="optional int" value={form.parent_event_id} onChange={(e) => setField("parent_event_id", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
          {loading ? "Creating..." : "Create Event"}
        </Button>

        {error && <ErrorBox error={error} />}
        {result && (
          <SuccessBox>
            <Label className="text-xs font-medium text-green-800 dark:text-green-200">Event Created</Label>
            <code className="mt-2 block whitespace-pre-wrap break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
              {JSON.stringify(result, null, 2)}
            </code>
          </SuccessBox>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create Market Modal
// ---------------------------------------------------------------------------

function CreateMarketModal({
  dpmUrl,
  eventExternalId,
  eventTitle,
  onClose,
  onCreated,
}: {
  dpmUrl: string;
  eventExternalId: string;
  eventTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    question: "",
    slug: "",
    description: "",
    resolution_source: "",
    start_date: "",
    end_date: "",
    neg_risk: "false",
    neg_risk_market_id: "",
    neg_risk_request_id: "",
    neg_risk_other: "false",
    active: "true",
    closed: "false",
    archived: "false",
    restricted: "false",
    accepting_orders: "true",
    funded: "false",
    approved: "false",
    activation: "AUTO",
    clear_book_on_start: "false",
    rfq_enabled: "false",
    order_price_min_tick_size: "",
    order_min_size: "",
    uma_bond: "",
    uma_reward: "",
    seconds_delay: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  function setField(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: Record<string, any> = {
      event_external_id: eventExternalId,
      question: form.question,
      active: form.active === "true",
      closed: form.closed === "true",
      archived: form.archived === "true",
      restricted: form.restricted === "true",
      neg_risk: form.neg_risk === "true",
      neg_risk_other: form.neg_risk_other === "true",
      accepting_orders: form.accepting_orders === "true",
      funded: form.funded === "true",
      approved: form.approved === "true",
      activation: form.activation,
      clear_book_on_start: form.clear_book_on_start === "true",
      rfq_enabled: form.rfq_enabled === "true",
    };

    if (form.slug) payload.slug = form.slug;
    if (form.description) payload.description = form.description;
    if (form.resolution_source) payload.resolution_source = form.resolution_source;
    if (form.start_date) payload.start_date = new Date(form.start_date).toISOString();
    if (form.end_date) payload.end_date = new Date(form.end_date).toISOString();
    if (form.neg_risk_market_id) payload.neg_risk_market_id = form.neg_risk_market_id;
    if (form.neg_risk_request_id) payload.neg_risk_request_id = form.neg_risk_request_id;
    if (form.order_price_min_tick_size) payload.order_price_min_tick_size = parseFloat(form.order_price_min_tick_size);
    if (form.order_min_size) payload.order_min_size = parseInt(form.order_min_size, 10);
    if (form.uma_bond) payload.uma_bond = parseInt(form.uma_bond, 10);
    if (form.uma_reward) payload.uma_reward = parseInt(form.uma_reward, 10);
    if (form.seconds_delay) payload.seconds_delay = parseFloat(form.seconds_delay);

    const res = await createMarket(dpmUrl, payload);
    if (res.success) {
      setResult(res.data);
      onCreated();
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit = form.question && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-semibold">Create Market</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              For event: <span className="font-medium">{eventTitle}</span>
              <span className="ml-2 font-mono text-zinc-400">{eventExternalId.slice(0, 12)}...</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Question <span className="text-red-500">*</span></Label>
              <Input placeholder="Will X happen by Y?" value={form.question} onChange={(e) => setField("question", e.target.value)} className="mt-1 h-8 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Slug</Label>
                <Input placeholder="market-slug" value={form.slug} onChange={(e) => setField("slug", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Resolution Source</Label>
                <Input placeholder="https://..." value={form.resolution_source} onChange={(e) => setField("resolution_source", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Description</Label>
              <textarea placeholder="Market description" value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Start Date</Label>
                <Input type="datetime-local" value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">End Date</Label>
                <Input type="datetime-local" value={form.end_date} onChange={(e) => setField("end_date", e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            {/* Boolean flags */}
            <div className="grid grid-cols-4 gap-3">
              {([["active", "Active"], ["closed", "Closed"], ["archived", "Archived"], ["restricted", "Restricted"]] as const).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs font-medium">{label}</Label>
                  <select value={form[key]} onChange={(e) => setField(key, e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {([["accepting_orders", "Accepting Orders"], ["funded", "Funded"], ["approved", "Approved"], ["rfq_enabled", "RFQ Enabled"]] as const).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs font-medium">{label}</Label>
                  <select value={form[key]} onChange={(e) => setField(key, e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Activation</Label>
                <select value={form.activation} onChange={(e) => setField("activation", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="AUTO">AUTO</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Clear Book on Start</Label>
                <select value={form.clear_book_on_start} onChange={(e) => setField("clear_book_on_start", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>

            {/* Neg risk */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-xs font-medium">Neg Risk</Label>
                <select value={form.neg_risk} onChange={(e) => setField("neg_risk", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Neg Risk Market ID</Label>
                <Input placeholder="optional" value={form.neg_risk_market_id} onChange={(e) => setField("neg_risk_market_id", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Neg Risk Request ID</Label>
                <Input placeholder="optional" value={form.neg_risk_request_id} onChange={(e) => setField("neg_risk_request_id", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Neg Risk Other</Label>
                <select value={form.neg_risk_other} onChange={(e) => setField("neg_risk_other", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>

            {/* Numeric */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-xs font-medium">Min Tick Size</Label>
                <Input placeholder="0.01" value={form.order_price_min_tick_size} onChange={(e) => setField("order_price_min_tick_size", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Min Order Size</Label>
                <Input placeholder="1" value={form.order_min_size} onChange={(e) => setField("order_min_size", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">UMA Bond</Label>
                <Input placeholder="0" value={form.uma_bond} onChange={(e) => setField("uma_bond", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">UMA Reward</Label>
                <Input placeholder="0" value={form.uma_reward} onChange={(e) => setField("uma_reward", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Seconds Delay</Label>
              <Input placeholder="optional" value={form.seconds_delay} onChange={(e) => setField("seconds_delay", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
            </div>

            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
              {loading ? "Creating..." : "Create Market"}
            </Button>

            {error && <ErrorBox error={error} />}
            {result && (
              <SuccessBox>
                <Label className="text-xs font-medium text-green-800 dark:text-green-200">Market Creation Accepted</Label>
                <p className="mt-1 text-xs text-green-700 dark:text-green-300">Deployment is asynchronous via Temporal workflow.</p>
                <code className="mt-2 block whitespace-pre-wrap break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                  {JSON.stringify(result, null, 2)}
                </code>
              </SuccessBox>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relayer Wallets Tab
// ---------------------------------------------------------------------------

function RelayerWalletsTab({ dpmUrl }: { dpmUrl: string }) {
  // --- List state ---
  const [wallets, setWallets] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 10;

  // Search filters
  const [filterAddress, setFilterAddress] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLabel, setFilterLabel] = useState("");

  const fetchWallets = useCallback(
    async (pageNum: number) => {
      setListLoading(true);
      setListError(null);
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      };
      if (filterAddress) params.address = filterAddress;
      if (filterType) params.wallet_type = filterType;
      if (filterLabel) params.label = filterLabel;

      const res = await listRelayerWallets(dpmUrl, params);
      if (res.success) {
        setWallets(res.data.data ?? []);
        setTotal(res.data.total ?? 0);
        setTotalPages(res.data.total_pages ?? 0);
      } else {
        setListError(res.error);
      }
      setListLoading(false);
    },
    [dpmUrl, filterAddress, filterType, filterLabel]
  );

  useEffect(() => {
    fetchWallets(page);
  }, [fetchWallets, page]);

  function handleSearch() {
    setPage(0);
    fetchWallets(0);
  }

  // --- Create state ---
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    private_key: "",
    wallet_type: "RELAYER_ADMIN",
    label: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<any | null>(null);

  function setField(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setCreateLoading(true);
    setCreateError(null);
    setCreateResult(null);

    const payload: { private_key: string; wallet_type: string; label?: string } = {
      private_key: form.private_key,
      wallet_type: form.wallet_type,
    };
    if (form.label) payload.label = form.label;

    const res = await createRelayerWallet(dpmUrl, payload);
    if (res.success) {
      setCreateResult(res.data);
      setForm({ private_key: "", wallet_type: "RELAYER_ADMIN", label: "" });
      // Refresh list to show the new wallet
      fetchWallets(page);
    } else {
      setCreateError(res.error);
    }
    setCreateLoading(false);
  }

  const canSubmit = form.private_key && form.wallet_type && !createLoading;

  const typeColors: Record<string, string> = {
    UMA_ADMIN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    RELAYER_ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    CTF_ADMIN: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  };

  return (
    <div className="space-y-4">
      {/* Wallets List */}
      <Card
        title={`Relayer Wallets${total > 0 ? ` (${total})` : ""}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? "Hide" : "+ New Wallet"}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Search filters */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by address..."
              value={filterAddress}
              onChange={(e) => setFilterAddress(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 flex-1 font-mono text-xs"
            />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(0);
              }}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">All Types</option>
              <option value="RELAYER_ADMIN">RELAYER_ADMIN</option>
              <option value="UMA_ADMIN">UMA_ADMIN</option>
              <option value="CTF_ADMIN">CTF_ADMIN</option>
            </select>
            <Input
              placeholder="Search by label..."
              value={filterLabel}
              onChange={(e) => setFilterLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 w-40 text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleSearch}>
              Search
            </Button>
          </div>

          {listError && <ErrorBox error={listError} />}

          {/* Table */}
          {listLoading && wallets.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : wallets.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No wallets found
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-500">ID</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Address</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Type</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Label</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Nonce</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Active</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {wallets.map((w: any) => (
                    <tr
                      key={w.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 font-mono text-zinc-500">
                        {w.id}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {w.address}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          className={
                            typeColors[w.wallet_type] ||
                            "bg-zinc-100 text-zinc-800"
                          }
                        >
                          {w.wallet_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {w.label ?? "-"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {w.current_nonce}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            w.is_active
                              ? "bg-green-500"
                              : "bg-zinc-300 dark:bg-zinc-600"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {w.created_at
                          ? new Date(w.created_at).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages} ({total} total)
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || listLoading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || listLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Create Wallet (collapsible) */}
      {showCreate && (
        <Card title="Create Relayer Wallet">
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              Register a relayer wallet. The private key will be AES-256-GCM
              encrypted before storage. The derived Ethereum address is returned.
            </p>

            <div>
              <Label className="text-xs font-medium">
                Private Key <span className="text-red-500">*</span>
              </Label>
              <p className="text-xs text-zinc-400">
                Hex-encoded (with or without 0x prefix)
              </p>
              <Input
                type="password"
                placeholder="0x..."
                value={form.private_key}
                onChange={(e) => setField("private_key", e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">
                  Wallet Type <span className="text-red-500">*</span>
                </Label>
                <select
                  value={form.wallet_type}
                  onChange={(e) => setField("wallet_type", e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="RELAYER_ADMIN">RELAYER_ADMIN</option>
                  <option value="UMA_ADMIN">UMA_ADMIN</option>
                  <option value="CTF_ADMIN">CTF_ADMIN</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Label</Label>
                <Input
                  placeholder="optional label"
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full"
            >
              {createLoading ? "Creating..." : "Create Relayer Wallet"}
            </Button>

            {createError && <ErrorBox error={createError} />}

            {createResult && (
              <SuccessBox>
                <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                  Wallet Created
                </Label>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {[
                    ["ID", createResult.id],
                    ["Address", createResult.address],
                    ["Type", createResult.wallet_type],
                    ["Nonce", createResult.current_nonce],
                    ["Active", String(createResult.is_active)],
                    ["Label", createResult.label],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <span className="text-green-700 dark:text-green-300">
                        {label}:{" "}
                      </span>
                      <span className="font-mono text-green-800 dark:text-green-200">
                        {String(value ?? "-")}
                      </span>
                    </div>
                  ))}
                </div>
              </SuccessBox>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Smart Account Tab
// ---------------------------------------------------------------------------

function SmartAccountTab({ dpmUrl }: { dpmUrl: string }) {
  const [form, setForm] = useState({
    operator_id: "",
    address: "",
    builder_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  function setField(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await getSmartAccount(dpmUrl, {
      operator_id: form.operator_id,
      address: form.address,
      builder_id: form.builder_id || undefined,
    });
    if (res.success) {
      setResult(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit = form.operator_id && form.address && !loading;

  return (
    <div className="space-y-4">
      <Card title="Derive Smart Account Address">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Derive the proxy wallet (smart account) address for a user. Uses
            CREATE2 derivation from the factory contract.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">
                Operator ID <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="operator-id"
                value={form.operator_id}
                onChange={(e) => setField("operator_id", e.target.value.trim())}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">
                User Address <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="0x..."
                value={form.address}
                onChange={(e) => setField("address", e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium">Builder ID</Label>
            <p className="text-xs text-zinc-400">
              Optional. If set, salt = keccak256(address || builder_id). If
              omitted, uses default proxy derivation.
            </p>
            <Input
              placeholder="optional integer"
              value={form.builder_id}
              onChange={(e) => setField("builder_id", e.target.value.trim())}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full"
          >
            {loading ? "Deriving..." : "Derive Smart Account"}
          </Button>

          {error && <ErrorBox error={error} />}

          {result && (
            <SuccessBox>
              <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                Smart Account Address
              </Label>
              <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
                {result.smart_account_address}
              </code>
            </SuccessBox>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collateral Balance Tab
// ---------------------------------------------------------------------------

function CollateralBalanceTab({ dpmUrl }: { dpmUrl: string }) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await getCollateralBalance(dpmUrl, address);
    if (res.success) {
      setResult(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Card title="Collateral Token Balance">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Query the ERC-20 collateral token balance for any address. Returns
            both raw and human-readable (normalized) values.
          </p>

          <div>
            <Label className="text-xs font-medium">
              Address <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!address || loading}
            className="w-full"
          >
            {loading ? "Fetching..." : "Get Balance"}
          </Button>

          {error && <ErrorBox error={error} />}

          {result && (
            <SuccessBox>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Normalized Balance
                  </Label>
                  <code className="mt-1 block rounded bg-white px-3 py-2 font-mono text-lg dark:bg-zinc-900">
                    {result.balance_normalized}
                  </code>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  <div>
                    <span className="text-green-700 dark:text-green-300">
                      Raw:{" "}
                    </span>
                    <span className="font-mono text-green-800 dark:text-green-200">
                      {result.balance_raw}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 dark:text-green-300">
                      Decimals:{" "}
                    </span>
                    <span className="font-mono text-green-800 dark:text-green-200">
                      {result.decimals}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 dark:text-green-300">
                      Address:{" "}
                    </span>
                    <span className="font-mono text-green-800 dark:text-green-200">
                      {result.address}
                    </span>
                  </div>
                </div>
              </div>
            </SuccessBox>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function usePersistedState(key: string, defaultValue: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return defaultValue;
    return sessionStorage.getItem(key) ?? defaultValue;
  });
  useEffect(() => {
    sessionStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue];
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const [gammaUrl, setGammaUrl] = usePersistedState("admin_gamma_url", process.env.NEXT_PUBLIC_GAMMA_API_URL || DEFAULT_GAMMA_URL);
  const [dpmUrl, setDpmUrl] = usePersistedState("admin_dpm_url", process.env.NEXT_PUBLIC_DPM_API_URL || DEFAULT_DPM_URL);
  const [showConfig, setShowConfig] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: "events", label: "Events" },
    { key: "relayer-wallets", label: "Relayer Wallets" },
    { key: "smart-account", label: "Smart Account" },
    { key: "collateral", label: "Collateral Balance" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Admin CRM</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Manage events and markets via DPM API & Gamma API
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig((s) => !s)}
          >
            {showConfig ? "Hide Config" : "API Config"}
          </Button>
        </div>

        {/* API Config */}
        {showConfig && (
          <div className="mt-4 flex gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <UrlSelector
              label="Gamma API (read)"
              presets={GAMMA_PRESETS}
              value={gammaUrl}
              onChange={setGammaUrl}
            />
            <UrlSelector
              label="DPM API (write)"
              presets={DPM_PRESETS}
              value={dpmUrl}
              onChange={setDpmUrl}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content — all tabs stay mounted to preserve form state */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <div className={activeTab === "events" ? "" : "hidden"}><EventsTab gammaUrl={gammaUrl} dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "relayer-wallets" ? "" : "hidden"}><RelayerWalletsTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "smart-account" ? "" : "hidden"}><SmartAccountTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "collateral" ? "" : "hidden"}><CollateralBalanceTab dpmUrl={dpmUrl} /></div>
        </div>
      </div>
    </div>
  );
}
