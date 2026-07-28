"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RelayerWalletWithdrawDialog } from "@/components/admin/relayer-wallet-withdraw";
import {
  searchEvents,
  getEventBySlug,
  createEvent,
  createMarket,
  createCtfOracleMarket,
  ctfOracleReportPayouts,
  umaPropose,
  umaResolve,
  umaReset,
  umaResolveManually,
  umaDispute,
  umaPushPrice,
  umaExternalPropose,
  listRelayerWallets,
  createRelayerWallet,
  deactivateRelayerWallet,
  createBuilder,
  getSmartAccount,
  getCollateralBalance,
  listContracts,
  createContract,
  listUsers,
  backfillCollateral,
  syncCollateralUser,
  getConditionalTokenBalance,
  getUserTokenBalances,
  syncUserTokenBalance,
  syncUserTokenBalancesFromOrders,
  treasuryGetBalances,
  treasuryHasRole,
  treasuryGrantOperatorRole,
  treasuryRevokeOperatorRole,
  treasuryGrantAdminRole,
  treasuryRevokeAdminRole,
  treasuryWithdrawETH,
  treasuryWithdrawToken,
  listTags,
  createTag,
  listSeries,
  createSeries,
} from "@/lib/admin/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab =
  | "events"
  | "create-from-slug"
  | "relayer-wallets"
  | "builders"
  | "smart-account"
  | "collateral"
  | "balances"
  | "contracts"
  | "tags"
  | "series"
  | "treasury";

const DEFAULT_GAMMA_URL = "http://localhost:8084";
const DEFAULT_DPM_URL = "http://localhost:8086";

// UMA OptimisticOracle price values for binary YES_OR_NO_QUERY resolutions.
//   - YES / NO / UNKNOWN are the three valid settlement prices accepted by
//     UmaCtfAdapter._constructPayouts (0, 0.5e18, 1e18).
//   - IGNORE is type(int256).min — NOT a resolution value. When the adapter
//     sees this on settle it calls _reset() and re-requests the question.
//     Useful for testing the reset/re-request path end-to-end.
const INT256_MIN =
  "-57896044618658097711785492504343953926634992332820282019728792003956564819968";

const UMA_PRICE_OPTIONS: { value: string; label: string }[] = [
  { value: "1000000000000000000", label: "YES (1e18)" },
  { value: "0", label: "NO (0)" },
  { value: "500000000000000000", label: "UNKNOWN / 50-50 (0.5e18)" },
  { value: INT256_MIN, label: "IGNORE / reset (int256.min)" },
];

const GAMMA_PRESETS = [
  { label: "Local (localhost:8084)", value: DEFAULT_GAMMA_URL },
  ...(process.env.NEXT_PUBLIC_GAMMA_API_BASE_URL
    ? [{ label: "Remote", value: process.env.NEXT_PUBLIC_GAMMA_API_BASE_URL }]
    : []),
];

const DPM_PRESETS = [
  { label: "Local (localhost:8086)", value: DEFAULT_DPM_URL },
  ...(process.env.NEXT_PUBLIC_DPM_API_BASE_URL
    ? [{ label: "Remote", value: process.env.NEXT_PUBLIC_DPM_API_BASE_URL }]
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

function isMetadataValid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function MetadataHint({ value }: { value: string }) {
  const trimmed = value.trim();
  if (!trimmed) {
    return (
      <p className="mt-1 text-[10px] text-zinc-400">Leave empty to skip.</p>
    );
  }
  try {
    JSON.parse(trimmed);
    return (
      <p className="mt-1 text-[10px] text-green-600 dark:text-green-400">
        Valid JSON
      </p>
    );
  } catch (e: any) {
    return (
      <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">
        Invalid JSON: {e.message}
      </p>
    );
  }
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

// gamma-api's /events endpoint has no text-search query param (unlike /tags,
// which supports `search=`), so matching by title/slug/ID has to happen
// client-side. A single 20-row page is too small a pool to search over, so
// when a query is present we page through the backend ourselves — up to
// EVENTS_SEARCH_MAX_PAGES pages of EVENTS_SEARCH_PAGE_LIMIT (the backend's
// max page size) — and filter the combined result set.
const EVENTS_SEARCH_PAGE_LIMIT = 100;
const EVENTS_SEARCH_MAX_PAGES = 5;

function eventMatchesQuery(event: any, query: string): boolean {
  const title = (event.title || "").toLowerCase();
  const slug = (event.slug || "").toLowerCase();
  const id = (event.id || "").toLowerCase();
  return title.includes(query) || slug.includes(query) || id.includes(query);
}

async function searchEventsAcrossPages(
  gammaUrl: string,
  baseParams: Record<string, string>,
  query: string
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  const q = query.toLowerCase();
  const matches: any[] = [];

  for (let page = 0; page < EVENTS_SEARCH_MAX_PAGES; page++) {
    const res = await searchEvents(gammaUrl, {
      ...baseParams,
      limit: String(EVENTS_SEARCH_PAGE_LIMIT),
      offset: String(page * EVENTS_SEARCH_PAGE_LIMIT),
    });
    if (!res.success) return res;

    matches.push(...res.data.filter((e: any) => eventMatchesQuery(e, q)));
    if (res.data.length < EVENTS_SEARCH_PAGE_LIMIT) break; // reached the last page
  }

  return { success: true, data: matches };
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

  // Create market modals
  const [marketModalEvent, setMarketModalEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [moMarketModalEvent, setMoMarketModalEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const fetchEvents = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);

      const filterParams: Record<string, string> = {};
      if (filterActive) filterParams.active = filterActive;
      if (filterClosed) filterParams.closed = filterClosed;
      if (filterArchived) filterParams.archived = filterArchived;

      const res = debouncedSearch
        ? await searchEventsAcrossPages(gammaUrl, filterParams, debouncedSearch)
        : await searchEvents(gammaUrl, {
            ...filterParams,
            limit: String(PAGE_SIZE),
            offset: String(pageNum * PAGE_SIZE),
          });

      if (res.success) {
        setResults(res.data);
        setTotal(res.data.length);
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
                      <div className="col-span-1 flex justify-end gap-1">
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px] border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoMarketModalEvent({
                              id: eventId,
                              title: event.title || "Untitled",
                            });
                          }}
                        >
                          + CO Market
                        </Button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mb-2 ml-4 mt-1 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        {detailLoading ? (
                          <p className="text-xs text-zinc-500">Loading...</p>
                        ) : eventDetail ? (
                          <EventDetail event={eventDetail} dpmUrl={dpmUrl} />
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
        <CreateEventForm gammaUrl={gammaUrl} dpmUrl={dpmUrl} onCreated={() => fetchEvents(page)} />
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

      {/* Create Managed Oracle Market Modal */}
      {moMarketModalEvent && (
        <CreateCtfOracleMarketModal
          dpmUrl={dpmUrl}
          eventExternalId={moMarketModalEvent.id}
          eventTitle={moMarketModalEvent.title}
          onClose={() => setMoMarketModalEvent(null)}
          onCreated={() => {
            fetchEvents(page);
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

function EventDetail({ event, dpmUrl }: { event: any; dpmUrl: string }) {
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
          ["Metadata Type", event.metadata_type ?? event.metadataType],
          ["Metadata", event.metadata != null ? JSON.stringify(event.metadata) : undefined],
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
              <MarketCard key={m.id || m.ID || i} market={m} dpmUrl={dpmUrl} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ market: m, dpmUrl }: { market: any; dpmUrl: string }) {
  const [showPropose, setShowPropose] = useState(false);
  const [proposeForm, setProposeForm] = useState({ proposer_address: "", proposed_price: "" });
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeResult, setProposeResult] = useState<any | null>(null);

  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveResult, setResolveResult] = useState<any | null>(null);

  const [showDispute, setShowDispute] = useState(false);
  const [disputerAddress, setDisputerAddress] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeResult, setDisputeResult] = useState<any | null>(null);

  const [showExternalPropose, setShowExternalPropose] = useState(false);
  const [externalProposeForm, setExternalProposeForm] = useState({ proposerPrivateKey: "", proposedPrice: "" });
  const [externalProposeLoading, setExternalProposeLoading] = useState(false);
  const [externalProposeError, setExternalProposeError] = useState<string | null>(null);
  const [externalProposeResult, setExternalProposeResult] = useState<any | null>(null);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<any | null>(null);

  const [showManualResolve, setShowManualResolve] = useState(false);
  const [manualResolvePayouts, setManualResolvePayouts] = useState("");
  const [manualResolveLoading, setManualResolveLoading] = useState(false);
  const [manualResolveError, setManualResolveError] = useState<string | null>(null);
  const [manualResolveResult, setManualResolveResult] = useState<any | null>(null);

  const [showPushPrice, setShowPushPrice] = useState(false);
  const [pushPricePrice, setPushPricePrice] = useState("");
  const [pushPriceLoading, setPushPriceLoading] = useState(false);
  const [pushPriceError, setPushPriceError] = useState<string | null>(null);
  const [pushPriceResult, setPushPriceResult] = useState<any | null>(null);

  const [showReportPayouts, setShowReportPayouts] = useState(false);
  const [reportPayoutsValue, setReportPayoutsValue] = useState("");
  const [reportPayoutsLoading, setReportPayoutsLoading] = useState(false);
  const [reportPayoutsError, setReportPayoutsError] = useState<string | null>(null);
  const [reportPayoutsResult, setReportPayoutsResult] = useState<any | null>(null);

  const marketExternalId: string = m.id ?? m.ID ?? "";
  const questionId: string = m.question_id ?? m.questionID ?? "";
  const umaStatus = m.uma_resolution_status ?? m.umaResolutionStatus ?? "";
  const isCtfOracle = (m.resolution_type ?? m.resolutionType ?? m.market_type ?? m.marketType ?? "") === "CTF_ORACLE";

  async function handlePropose() {
    if (!marketExternalId) {
      setProposeError("Market has no external ID — cannot submit proposal");
      return;
    }
    setProposeLoading(true);
    setProposeError(null);
    setProposeResult(null);

    const res = await umaPropose(dpmUrl, {
      market_id: marketExternalId,
      proposer_address: proposeForm.proposer_address,
      proposed_price: proposeForm.proposed_price,
    });
    if (res.success) {
      setProposeResult(res.data);
    } else {
      setProposeError(res.error);
    }
    setProposeLoading(false);
  }

  async function handleResolve() {
    if (!marketExternalId) {
      setResolveError("Market has no external ID — cannot submit resolve");
      return;
    }
    setResolveLoading(true);
    setResolveError(null);
    setResolveResult(null);

    const res = await umaResolve(dpmUrl, { market_id: marketExternalId });
    if (res.success) {
      setResolveResult(res.data);
    } else {
      setResolveError(res.error);
    }
    setResolveLoading(false);
  }

  async function handleDispute() {
    if (!questionId) {
      setDisputeError("Market has no question_id — cannot dispute");
      return;
    }
    setDisputeLoading(true);
    setDisputeError(null);
    setDisputeResult(null);

    const res = await umaDispute(questionId, disputerAddress || undefined);
    if (!res.success) {
      setDisputeError(res.error);
      setDisputeLoading(false);
      return;
    }

    setDisputeResult(res);
    setDisputeLoading(false);
  }

  async function handleExternalPropose() {
    if (!questionId) {
      setExternalProposeError("Market has no question_id — cannot propose");
      return;
    }
    setExternalProposeLoading(true);
    setExternalProposeError(null);
    setExternalProposeResult(null);

    const res = await umaExternalPropose(
      questionId,
      externalProposeForm.proposedPrice,
      externalProposeForm.proposerPrivateKey
    );
    if (res.success) {
      setExternalProposeResult(res);
    } else {
      setExternalProposeError(res.error);
    }
    setExternalProposeLoading(false);
  }

  async function handleReset() {
    if (!marketExternalId) {
      setResetError("Market has no external ID — cannot submit reset");
      return;
    }
    setResetLoading(true);
    setResetError(null);
    setResetResult(null);

    const res = await umaReset(dpmUrl, { market_id: marketExternalId });
    if (res.success) {
      setResetResult(res.data);
    } else {
      setResetError(res.error);
    }
    setResetLoading(false);
  }

  async function handleManualResolve() {
    if (!marketExternalId) {
      setManualResolveError("Market has no external ID — cannot submit manual resolve");
      return;
    }
    const payouts = manualResolvePayouts.split(",").map((s) => s.trim()).filter(Boolean);
    if (payouts.length === 0) {
      setManualResolveError("Payouts are required (e.g. \"1,0\" for YES wins)");
      return;
    }
    setManualResolveLoading(true);
    setManualResolveError(null);
    setManualResolveResult(null);

    const res = await umaResolveManually(dpmUrl, { market_id: marketExternalId, payouts });
    if (res.success) {
      setManualResolveResult(res.data);
    } else {
      setManualResolveError(res.error);
    }
    setManualResolveLoading(false);
  }

  async function handlePushPrice() {
    if (!questionId) {
      setPushPriceError("Market has no question_id — cannot push price");
      return;
    }
    if (!pushPricePrice) {
      setPushPriceError("Select a price to push");
      return;
    }
    setPushPriceLoading(true);
    setPushPriceError(null);
    setPushPriceResult(null);

    const res = await umaPushPrice(questionId, pushPricePrice);
    if (res.success) {
      setPushPriceResult(res);
    } else {
      setPushPriceError(res.error);
    }
    setPushPriceLoading(false);
  }

  async function handleReportPayouts() {
    if (!marketExternalId) {
      setReportPayoutsError("Market has no external ID — cannot submit report payouts");
      return;
    }
    const payouts = reportPayoutsValue.split(",").map((s) => s.trim()).filter(Boolean);
    if (payouts.length === 0) {
      setReportPayoutsError("Payouts are required (e.g. \"1000000000000000000,0\" for YES wins)");
      return;
    }
    setReportPayoutsLoading(true);
    setReportPayoutsError(null);
    setReportPayoutsResult(null);

    const res = await ctfOracleReportPayouts(dpmUrl, { market_id: marketExternalId, payouts });
    if (res.success) {
      setReportPayoutsResult(res.data);
    } else {
      setReportPayoutsError(res.error);
    }
    setReportPayoutsLoading(false);
  }

  const canPropose = proposeForm.proposer_address && proposeForm.proposed_price && !proposeLoading;
  const canExternalPropose =
    externalProposeForm.proposerPrivateKey.trim() && externalProposeForm.proposedPrice && !externalProposeLoading;

  return (
    <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
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
        {isCtfOracle ? (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            CTF_ORACLE
          </Badge>
        ) : (
          umaStatus && (
            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
              UMA: {umaStatus}
            </Badge>
          )
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {[
          ["External ID", marketExternalId],
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
          ["Metadata Type", m.metadata_type ?? m.metadataType],
          ["Metadata", m.metadata != null ? JSON.stringify(m.metadata) : undefined],
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

      {/* Market Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        {isCtfOracle ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
              onClick={() => {
                setShowReportPayouts((s) => !s);
                setReportPayoutsError(null);
                setReportPayoutsResult(null);
              }}
            >
              {showReportPayouts ? "Cancel" : "Report Payouts"}
            </Button>
            {reportPayoutsError && <span className="text-[11px] text-red-600">{reportPayoutsError}</span>}
            {reportPayoutsResult && (
              <span className="text-[11px] text-green-600">
                Submitted (workflow: {reportPayoutsResult.workflow_id})
              </span>
            )}
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px]"
              onClick={() => {
                setShowPropose((s) => !s);
                setProposeError(null);
                setProposeResult(null);
              }}
            >
              {showPropose ? "Cancel" : "Propose"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px]"
              onClick={handleResolve}
              disabled={resolveLoading}
            >
              {resolveLoading ? "Resolving..." : "Resolve"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => {
                setShowDispute((s) => !s);
                setDisputeError(null);
                setDisputeResult(null);
              }}
              disabled={!questionId}
            >
              {showDispute ? "Cancel" : "Dispute"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-400 dark:hover:bg-sky-950"
              onClick={() => {
                setShowExternalPropose((s) => !s);
                setExternalProposeError(null);
                setExternalProposeResult(null);
              }}
              disabled={!questionId}
              title="Simulate a non-operator party proposing directly on the UMA Optimistic Oracle (bypasses dpm-api entirely)"
            >
              {showExternalPropose ? "Cancel" : "External Propose"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
              onClick={handleReset}
              disabled={resetLoading}
            >
              {resetLoading ? "Resetting..." : "Reset"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950"
              onClick={() => {
                setShowManualResolve((s) => !s);
                setManualResolveError(null);
                setManualResolveResult(null);
              }}
            >
              {showManualResolve ? "Cancel" : "Resolve Manually"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
              onClick={() => {
                setShowPushPrice((s) => !s);
                setPushPriceError(null);
                setPushPriceResult(null);
              }}
              disabled={!questionId}
              title="Simulate UMA DVM vote outcome on the mock oracle (dev-only)"
            >
              {showPushPrice ? "Cancel" : "Push Price (Mock DVM)"}
            </Button>
            {resolveError && <span className="text-[11px] text-red-600">{resolveError}</span>}
            {resolveResult && (
              <span className="text-[11px] text-green-600">
                Resolve submitted (workflow: {resolveResult.workflow_id})
              </span>
            )}
            {resetError && <span className="text-[11px] text-red-600">{resetError}</span>}
            {resetResult && (
              <span className="text-[11px] text-green-600">
                Reset submitted (workflow: {resetResult.workflow_id})
              </span>
            )}
          </>
        )}
      </div>

      {showDispute && (
        <div className="mt-3 space-y-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
            Dispute price via UMA Optimistic Oracle
          </p>
          <div>
            <Label className="text-[11px] font-medium">
              Disputer Address <span className="text-zinc-400">(optional — defaults to oracle admin)</span>
            </Label>
            <Input
              placeholder="0x... (leave blank to use oracle admin key)"
              value={disputerAddress}
              onChange={(e) => setDisputerAddress(e.target.value.trim())}
              className="mt-1 h-7 font-mono text-[11px]"
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 w-full text-[11px]"
            onClick={handleDispute}
            disabled={disputeLoading}
          >
            {disputeLoading ? "Disputing..." : "Submit Dispute"}
          </Button>
          {disputeError && <ErrorBox error={disputeError} />}
          {disputeResult && (
            <SuccessBox>
              <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
                Dispute TX: {disputeResult.txHash}
              </p>
            </SuccessBox>
          )}
        </div>
      )}

      {showExternalPropose && (
        <div className="mt-3 space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400">
            Simulate an external proposal directly on UMA Optimistic Oracle
          </p>
          <p className="text-[10px] text-sky-600/70 dark:text-sky-400/70">
            Sends <code className="rounded bg-sky-100 px-1 dark:bg-sky-900/50">proposePrice(...)</code> straight to
            the chain, signed by the private key below — not via dpm-api. Use this to test what happens when a
            non-operator party proposes a price (the backoffice&apos;s external-proposal dispute-watch). The
            proposer&apos;s wallet needs enough of the bond currency and native gas; the bond is auto-approved to
            the oracle if its allowance is insufficient.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-medium">
                Proposer Private Key <span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                placeholder="0x..."
                value={externalProposeForm.proposerPrivateKey}
                onChange={(e) =>
                  setExternalProposeForm((f) => ({ ...f, proposerPrivateKey: e.target.value.trim() }))
                }
                className="mt-1 h-7 font-mono text-[11px]"
              />
            </div>
            <div>
              <Label className="text-[11px] font-medium">
                Proposed Price <span className="text-red-500">*</span>
              </Label>
              <select
                value={externalProposeForm.proposedPrice}
                onChange={(e) => setExternalProposeForm((f) => ({ ...f, proposedPrice: e.target.value }))}
                className="mt-1 h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select...</option>
                {UMA_PRICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 w-full bg-sky-600 text-[11px] text-white hover:bg-sky-700"
            onClick={handleExternalPropose}
            disabled={!canExternalPropose}
          >
            {externalProposeLoading ? "Submitting..." : "Submit External Proposal"}
          </Button>
          {externalProposeError && <ErrorBox error={externalProposeError} />}
          {externalProposeResult && (
            <SuccessBox>
              <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
                Proposal TX: {externalProposeResult.txHash}
                <br />
                Proposer: {externalProposeResult.proposerAddress}
              </p>
            </SuccessBox>
          )}
        </div>
      )}

      {showReportPayouts && (
        <div className="mt-3 space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            Report payouts via CtfOracle contract
          </p>
          <div>
            <Label className="text-[11px] font-medium">
              Payouts <span className="text-red-500">*</span>{" "}
              <span className="text-zinc-400">(comma-separated, e.g. "1,0" for YES wins)</span>
            </Label>
            <Input
              placeholder="1,0"
              value={reportPayoutsValue}
              onChange={(e) => setReportPayoutsValue(e.target.value)}
              className="mt-1 h-7 font-mono text-[11px]"
            />
          </div>
          <Button
            size="sm"
            className="h-7 w-full bg-emerald-600 text-[11px] hover:bg-emerald-700 text-white"
            onClick={handleReportPayouts}
            disabled={reportPayoutsLoading || !reportPayoutsValue.trim()}
          >
            {reportPayoutsLoading ? "Submitting..." : "Submit Report Payouts"}
          </Button>
          {reportPayoutsError && (
            <p className="text-[11px] text-red-600">{reportPayoutsError}</p>
          )}
          {reportPayoutsResult && (
            <div className="rounded bg-emerald-100 p-2 dark:bg-emerald-900/40">
              <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
                Submitted — workflow: {reportPayoutsResult.workflow_id}
              </p>
            </div>
          )}
        </div>
      )}

      {showPropose && (
        <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
            Submit a price proposal via UMA Optimistic Oracle
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-medium">
                Proposer Address <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="0x..."
                value={proposeForm.proposer_address}
                onChange={(e) => setProposeForm((f) => ({ ...f, proposer_address: e.target.value.trim() }))}
                className="mt-1 h-7 font-mono text-[11px]"
              />
            </div>
            <div>
              <Label className="text-[11px] font-medium">
                Proposed Price <span className="text-red-500">*</span>
              </Label>
              <select
                value={proposeForm.proposed_price}
                onChange={(e) => setProposeForm((f) => ({ ...f, proposed_price: e.target.value }))}
                className="mt-1 h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Select...</option>
                {UMA_PRICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 w-full text-[11px]"
            onClick={handlePropose}
            disabled={!canPropose}
          >
            {proposeLoading ? "Submitting..." : "Submit Proposal"}
          </Button>
          {proposeError && <ErrorBox error={proposeError} />}
          {proposeResult && (
            <SuccessBox>
              <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
                Proposal submitted (workflow: {proposeResult.workflow_id})
              </p>
            </SuccessBox>
          )}
        </div>
      )}

      {showManualResolve && (
        <div className="mt-3 space-y-3 rounded-md border border-purple-200 bg-purple-50 p-3 dark:border-purple-900 dark:bg-purple-950/30">
          <p className="text-[11px] font-medium text-purple-700 dark:text-purple-400">
            Manually resolve via UMA CTF Adapter (bypasses oracle liveness)
          </p>
          <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70">
            Only works on markets that have been <strong>flagged</strong> via the Optimistic Oracle&apos;s <code className="rounded bg-purple-100 px-1 dark:bg-purple-900/50">flag()</code> method, and only after the 1-hour safety period has elapsed since flagging.
          </p>
          <div>
            <Label className="text-[11px] font-medium">
              Payouts <span className="text-red-500">*</span>
              <span className="ml-1 text-zinc-400">(comma-separated, e.g. &quot;1,0&quot; for YES wins)</span>
            </Label>
            <Input
              placeholder="1,0"
              value={manualResolvePayouts}
              onChange={(e) => setManualResolvePayouts(e.target.value)}
              className="mt-1 h-7 font-mono text-[11px]"
            />
          </div>
          <Button
            size="sm"
            className="h-7 w-full bg-purple-600 text-[11px] text-white hover:bg-purple-700"
            onClick={handleManualResolve}
            disabled={manualResolveLoading || !manualResolvePayouts.trim()}
          >
            {manualResolveLoading ? "Submitting..." : "Submit Manual Resolve"}
          </Button>
          {manualResolveError && <ErrorBox error={manualResolveError} />}
          {manualResolveResult && (
            <SuccessBox>
              <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
                Manual resolve submitted (workflow: {manualResolveResult.workflow_id})
              </p>
            </SuccessBox>
          )}
        </div>
      )}

      {showPushPrice && (
        <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Push price to mock DVM oracle (dev-only)
          </p>
          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
            Simulates the UMA DVM voters finalizing a disputed price. Only works after a dispute has escalated the request to the mock oracle. Calls <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">MockOracleAncillary.pushPrice(...)</code> directly on-chain.
          </p>
          <div>
            <Label className="text-[11px] font-medium">
              Price <span className="text-red-500">*</span>
            </Label>
            <select
              value={pushPricePrice}
              onChange={(e) => setPushPricePrice(e.target.value)}
              className="mt-1 h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select...</option>
              {UMA_PRICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            className="h-7 w-full bg-amber-600 text-[11px] text-white hover:bg-amber-700"
            onClick={handlePushPrice}
            disabled={pushPriceLoading || !pushPricePrice}
          >
            {pushPriceLoading ? "Pushing..." : "Push Price"}
          </Button>
          {pushPriceError && <ErrorBox error={pushPriceError} />}
          {pushPriceResult && (
            <SuccessBox>
              <p className="text-[11px] font-medium text-green-800 dark:text-green-200">
                Push TX: {pushPriceResult.txHash}
              </p>
            </SuccessBox>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Event Form (inline, collapsible)
// ---------------------------------------------------------------------------

function CreateEventForm({ gammaUrl, dpmUrl, onCreated }: { gammaUrl: string; dpmUrl: string; onCreated: () => void }) {
  const [form, setForm] = useState({
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
    deploying_timestamp: "",
    parent_event_id: "",
    comment_count: "",
    metadata_type: "",
    metadata: "",
  });
  const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<SeriesOption | null>(null);
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
    if (form.deploying_timestamp) payload.deploying_timestamp = new Date(form.deploying_timestamp).toISOString();
    if (form.parent_event_id) payload.parent_event_id = parseInt(form.parent_event_id, 10);
    if (selectedSeries) payload.series_external_id = selectedSeries.external_id;
    if (form.comment_count) payload.comment_count = parseInt(form.comment_count, 10);
    if (selectedTags.length > 0) payload.tag_ids = selectedTags.map((t) => t.id);
    if (form.metadata_type) payload.metadata_type = form.metadata_type;
    if (form.metadata.trim()) {
      try {
        payload.metadata = JSON.parse(form.metadata);
      } catch (e: any) {
        setError(`Invalid metadata JSON: ${e.message}`);
        setLoading(false);
        return;
      }
    }

    const res = await createEvent(dpmUrl, payload);
    if (res.success) {
      setResult(res.data);
      setForm({ slug: "", title: "", ticker: "", description: "", resolution_source: "", start_date: "", end_date: "", icon: "", active: "true", closed: "false", archived: "false", restricted: "false", neg_risk: "false", neg_risk_market_id: "", deployment_status: "PENDING", deploying_timestamp: "", parent_event_id: "", comment_count: "", metadata_type: "", metadata: "" });
      setSelectedTags([]);
      setSelectedSeries(null);
      onCreated();
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit = form.slug && form.title && !loading && isMetadataValid(form.metadata);

  return (
    <Card title="Create Event">
      <div className="space-y-4">
        <p className="text-[10px] text-zinc-400">External ID is generated server-side as a UUID.</p>
        <div className="grid grid-cols-2 gap-3">
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
            <Label className="text-xs font-medium">Deploying Timestamp</Label>
            <Input type="datetime-local" value={form.deploying_timestamp} onChange={(e) => setField("deploying_timestamp", e.target.value)} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Comment Count</Label>
            <Input placeholder="optional int" value={form.comment_count} onChange={(e) => setField("comment_count", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium">Neg Risk Market ID</Label>
            <Input placeholder="optional" value={form.neg_risk_market_id} onChange={(e) => setField("neg_risk_market_id", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-medium">Parent Event ID</Label>
            <Input placeholder="optional int" value={form.parent_event_id} onChange={(e) => setField("parent_event_id", e.target.value.trim())} className="mt-1 h-8 text-xs" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium">Series</Label>
          <p className="mb-1 text-[10px] text-zinc-400">
            Search existing series. Manage series in the Series tab.
          </p>
          <div className="mt-1">
            <SeriesSearchSelect gammaUrl={gammaUrl} selected={selectedSeries} onChange={setSelectedSeries} />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium">Tags</Label>
          <p className="mb-1 text-[10px] text-zinc-400">
            Search existing tags by label or slug. Manage tags in the Tags tab.
          </p>
          <div className="mt-1">
            <TagSearchSelect gammaUrl={gammaUrl} selected={selectedTags} onChange={setSelectedTags} />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium">Metadata Type</Label>
          <p className="mb-1 text-[10px] text-zinc-400">
            Free-form classifier paired with metadata.
          </p>
          <Input placeholder="e.g. sports, crypto, election" value={form.metadata_type} onChange={(e) => setField("metadata_type", e.target.value.trim())} className="mt-1 h-8 text-xs" />
        </div>

        <div>
          <Label className="text-xs font-medium">Metadata (JSON)</Label>
          <p className="mb-1 text-[10px] text-zinc-400">
            Optional opaque JSON payload. Validated client-side before submit.
          </p>
          <textarea
            placeholder='{"key": "value"}'
            value={form.metadata}
            onChange={(e) => setField("metadata", e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <MetadataHint value={form.metadata} />
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
    accepting_orders_timestamp: "",
    funded: "false",
    approved: "false",
    activation: "AUTO",
    automatically_active: "false",
    clear_book_on_start: "false",
    rfq_enabled: "false",
    order_price_min_tick_size: "",
    order_min_size: "",
    uma_bond: "",
    uma_reward: "",
    uma_resolution_status: "",
    liveness: "",
    seconds_delay: "",
    metadata_type: "",
    metadata: "",
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
      automatically_active: form.automatically_active === "true",
      clear_book_on_start: form.clear_book_on_start === "true",
      rfq_enabled: form.rfq_enabled === "true",
    };

    if (form.slug) payload.slug = form.slug;
    if (form.description) payload.description = form.description;
    if (form.resolution_source) payload.resolution_source = form.resolution_source;
    if (form.start_date) payload.start_date = new Date(form.start_date).toISOString();
    if (form.end_date) payload.end_date = new Date(form.end_date).toISOString();
    if (form.accepting_orders_timestamp) payload.accepting_orders_timestamp = new Date(form.accepting_orders_timestamp).toISOString();
    if (form.neg_risk_market_id) payload.neg_risk_market_id = form.neg_risk_market_id;
    if (form.neg_risk_request_id) payload.neg_risk_request_id = form.neg_risk_request_id;
    if (form.order_price_min_tick_size) payload.order_price_min_tick_size = parseFloat(form.order_price_min_tick_size);
    if (form.order_min_size) payload.order_min_size = parseInt(form.order_min_size, 10);
    if (form.uma_bond) payload.uma_bond = form.uma_bond;
    if (form.uma_reward) payload.uma_reward = form.uma_reward;
    if (form.uma_resolution_status) payload.uma_resolution_status = form.uma_resolution_status;
    if (form.liveness) payload.liveness = form.liveness;
    if (form.seconds_delay) payload.seconds_delay = parseFloat(form.seconds_delay);
    if (form.metadata_type) payload.metadata_type = form.metadata_type;
    if (form.metadata.trim()) {
      try {
        payload.metadata = JSON.parse(form.metadata);
      } catch (e: any) {
        setError(`Invalid metadata JSON: ${e.message}`);
        setLoading(false);
        return;
      }
    }

    const res = await createMarket(dpmUrl, payload);
    if (res.success) {
      setResult(res.data);
      onCreated();
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit = form.question && !loading && isMetadataValid(form.metadata);

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

            <div>
              <Label className="text-xs font-medium">Accepting Orders Timestamp</Label>
              <Input type="datetime-local" value={form.accepting_orders_timestamp} onChange={(e) => setField("accepting_orders_timestamp", e.target.value)} className="mt-1 h-8 text-xs" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Activation</Label>
                <select value={form.activation} onChange={(e) => setField("activation", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="AUTO">AUTO</option>
                  <option value="MANUAL">MANUAL</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Automatically Active</Label>
                <select value={form.automatically_active} onChange={(e) => setField("automatically_active", e.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
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
              <div>
                <Label className="text-xs font-medium">Liveness (seconds)</Label>
                <Input placeholder="7200" value={form.liveness} onChange={(e) => setField("liveness", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
                <p className="mt-0.5 text-[10px] text-zinc-400">Defaults to env value (7200s / 2 hours) if empty.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Seconds Delay</Label>
                <Input placeholder="optional" value={form.seconds_delay} onChange={(e) => setField("seconds_delay", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">UMA Resolution Status</Label>
                <Input placeholder="optional" value={form.uma_resolution_status} onChange={(e) => setField("uma_resolution_status", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Metadata Type</Label>
              <p className="mb-1 text-[10px] text-zinc-400">Free-form classifier paired with metadata.</p>
              <Input placeholder="e.g. sports, crypto, election" value={form.metadata_type} onChange={(e) => setField("metadata_type", e.target.value.trim())} className="mt-1 h-8 text-xs" />
            </div>

            <div>
              <Label className="text-xs font-medium">Metadata (JSON)</Label>
              <p className="mb-1 text-[10px] text-zinc-400">
                Optional opaque JSON payload. Validated client-side before submit.
              </p>
              <textarea
                placeholder='{"key": "value"}'
                value={form.metadata}
                onChange={(e) => setField("metadata", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <MetadataHint value={form.metadata} />
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
// Create Managed Oracle Market Modal
// ---------------------------------------------------------------------------

function CreateCtfOracleMarketModal({
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
    outcome_0: "Up",
    outcome_1: "Down",
    slug: "",
    description: "",
    resolution_source: "",
    start_date: "",
    end_date: "",
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
      outcome_0: form.outcome_0 || undefined,
      outcome_1: form.outcome_1 || undefined,
      active: form.active === "true",
      closed: form.closed === "true",
      archived: form.archived === "true",
      restricted: form.restricted === "true",
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
    if (form.order_price_min_tick_size) payload.order_price_min_tick_size = parseFloat(form.order_price_min_tick_size);
    if (form.order_min_size) payload.order_min_size = parseInt(form.order_min_size, 10);

    const res = await createCtfOracleMarket(dpmUrl, payload);
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
      <div className="w-full max-w-2xl rounded-lg border border-orange-200 bg-white shadow-xl dark:border-orange-900 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-orange-200 px-6 py-4 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 rounded-t-lg">
          <div>
            <h3 className="text-lg font-semibold">Create Managed Oracle Market</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              For event: <span className="font-medium">{eventTitle}</span>
              <span className="ml-2 font-mono text-zinc-400">{eventExternalId.slice(0, 12)}...</span>
            </p>
            <p className="mt-0.5 text-[10px] text-orange-600 dark:text-orange-400">
              Admin-settled via CtfOracle · No UMA required
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
              <Input placeholder="Will ETH go up this week?" value={form.question} onChange={(e) => setField("question", e.target.value)} className="mt-1 h-8 text-xs" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Outcome 0 (Token 0)</Label>
                <Input placeholder="Up" value={form.outcome_0} onChange={(e) => setField("outcome_0", e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Outcome 1 (Token 1)</Label>
                <Input placeholder="Down" value={form.outcome_1} onChange={(e) => setField("outcome_1", e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Slug</Label>
              <Input placeholder="eth-up-week-1" value={form.slug} onChange={(e) => setField("slug", e.target.value)} className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs font-medium">Description</Label>
              <Input placeholder="optional" value={form.description} onChange={(e) => setField("description", e.target.value)} className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs font-medium">Resolution Source</Label>
              <Input placeholder="optional URL" value={form.resolution_source} onChange={(e) => setField("resolution_source", e.target.value)} className="mt-1 h-8 text-xs" />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Min Tick Size</Label>
                <Input placeholder="0.01" value={form.order_price_min_tick_size} onChange={(e) => setField("order_price_min_tick_size", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Min Order Size</Label>
                <Input placeholder="1" value={form.order_min_size} onChange={(e) => setField("order_min_size", e.target.value.trim())} className="mt-1 h-8 font-mono text-xs" />
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
              {loading ? "Creating..." : "Create Managed Oracle Market"}
            </Button>

            {error && <ErrorBox error={error} />}
            {result && (
              <SuccessBox>
                <Label className="text-xs font-medium text-green-800 dark:text-green-200">Market Creation Accepted</Label>
                <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-[10px] dark:bg-zinc-900">
                  {JSON.stringify(result, null, 2)}
                </pre>
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
  const [filterInitStatus, setFilterInitStatus] = useState("");

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
        // init_status filter is client-side because the list API doesn't
        // accept it as a query param yet; cheap given PAGE_SIZE=10.
        let rows = (res.data.data ?? []) as any[];
        if (filterInitStatus) {
          rows = rows.filter((w) => w.init_status === filterInitStatus);
        }
        setWallets(rows);
        setTotal(res.data.total ?? 0);
        setTotalPages(res.data.total_pages ?? 0);
      } else {
        setListError(res.error);
      }
      setListLoading(false);
    },
    [dpmUrl, filterAddress, filterType, filterLabel, filterInitStatus]
  );

  useEffect(() => {
    fetchWallets(page);
  }, [fetchWallets, page]);

  function handleSearch() {
    setPage(0);
    fetchWallets(0);
  }

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [withdrawWallet, setWithdrawWallet] = useState<any | null>(null);

  async function handleDeactivate(w: any) {
    if (!confirm(`Deactivate wallet ${w.address}?\nIt will no longer be auto-funded or picked up for relaying.`)) {
      return;
    }
    setDeactivatingId(w.id);
    const res = await deactivateRelayerWallet(dpmUrl, w.id);
    setDeactivatingId(null);
    if (res.success) {
      fetchWallets(page);
    } else {
      setListError(res.error);
    }
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
    FEE_ADMIN: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    TREASURY_ADMIN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    ORACLE_ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  const initStatusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search by address..."
              value={filterAddress}
              onChange={(e) => setFilterAddress(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 min-w-[180px] flex-1 font-mono text-xs"
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
              <option value="FEE_ADMIN">FEE_ADMIN</option>
              <option value="TREASURY_ADMIN">TREASURY_ADMIN</option>
              <option value="ORACLE_ADMIN">ORACLE_ADMIN</option>
            </select>
            <select
              value={filterInitStatus}
              onChange={(e) => {
                setFilterInitStatus(e.target.value);
                setPage(0);
              }}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">All Init Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchWallets(page)}
              disabled={listLoading}
            >
              {listLoading ? "Refreshing…" : "Refresh"}
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
                    <th className="px-3 py-2 font-medium text-zinc-500">Init</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Status</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Active</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Nonce</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Label</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Created</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {wallets.map((w: any) => (
                    <tr
                      key={w.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      title={w.init_error ? `Init error: ${w.init_error}` : undefined}
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
                      <td className="px-3 py-2">
                        <Badge className={initStatusColors[w.init_status] || "bg-zinc-100 text-zinc-800"}>
                          {w.init_status || "—"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {w.status}
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
                      <td className="px-3 py-2 font-mono">
                        {w.current_nonce}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {w.label ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {w.created_at
                          ? new Date(w.created_at).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {w.is_active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                              disabled={deactivatingId === w.id}
                              onClick={() => handleDeactivate(w)}
                            >
                              {deactivatingId === w.id ? "…" : "Deactivate"}
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-400">inactive</span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setWithdrawWallet(w)}
                            title={
                              w.is_active
                                ? "Deactivate first — manual withdraws race the relayer pool"
                                : "Withdraw POL or USDC.e from this wallet"
                            }
                          >
                            Withdraw
                          </Button>
                        </div>
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
                  <option value="FEE_ADMIN">FEE_ADMIN</option>
                  <option value="TREASURY_ADMIN">TREASURY_ADMIN</option>
                  <option value="ORACLE_ADMIN">ORACLE_ADMIN</option>
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

      <RelayerWalletWithdrawDialog
        dpmUrl={dpmUrl}
        walletId={withdrawWallet?.id ?? null}
        walletAddress={withdrawWallet?.address}
        isActive={!!withdrawWallet?.is_active}
        open={withdrawWallet != null}
        onOpenChange={(o) => {
          if (!o) setWithdrawWallet(null);
        }}
        onWithdrawSuccess={() => fetchWallets(page)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builders Tab (POST /builders)
// ---------------------------------------------------------------------------

function BuildersTab({ dpmUrl }: { dpmUrl: string }) {
  const [form, setForm] = useState({
    name: "",
    magic_public_key: "",
    magic_secret_key: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiPublicKey, setApiPublicKey] = useState<string | null>(null);

  function setField(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setApiPublicKey(null);
    const res = await createBuilder(dpmUrl, {
      name: form.name.trim(),
      magic_public_key: form.magic_public_key.trim(),
      magic_secret_key: form.magic_secret_key.trim(),
    });
    if (res.success) {
      setApiPublicKey(res.data.api_public_key);
      setForm({ name: "", magic_public_key: "", magic_secret_key: "" });
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const canSubmit =
    form.name.trim() &&
    form.magic_public_key.trim() &&
    form.magic_secret_key.trim() &&
    !loading;

  return (
    <div className="space-y-4">
      <Card title="Create builder (Magic tenant)">
        <p className="mb-4 text-xs text-zinc-500">
          Calls DPM{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">POST /builders</code>{" "}
          with your Magic app credentials. Builder display name and Magic publishable key must be
          unique. The returned{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">api_public_key</code> is the
          tenant key clients send (e.g. gamma login).
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Tenant / builder display name"
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="text-xs">Magic publishable key</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={form.magic_public_key}
              onChange={(e) => setField("magic_public_key", e.target.value)}
              placeholder="pk_live_…"
              autoComplete="off"
            />
          </div>
          <div>
            <Label className="text-xs">Magic secret key</Label>
            <Input
              type="password"
              className="mt-1 font-mono text-sm"
              value={form.magic_secret_key}
              onChange={(e) => setField("magic_secret_key", e.target.value)}
              placeholder="sk_live_…"
              autoComplete="off"
            />
          </div>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {loading ? "Creating…" : "Create builder"}
          </Button>
          {error && <ErrorBox error={error} />}
          {apiPublicKey && (
            <SuccessBox>
              <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                Builder API public key (save this — shown once)
              </Label>
              <p className="mt-2 break-all font-mono text-xs text-green-800 dark:text-green-200">
                {apiPublicKey}
              </p>
            </SuccessBox>
          )}
        </div>
      </Card>
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
// Balances Tab — user list with USDC balance / allowance + refresh actions
// ---------------------------------------------------------------------------

type UserRow = {
  id: number;
  address: string;
  proxy_wallet: string;
  name: string | null;
  pseudonym: string | null;
  email: string | null;
  balance: {
    usdc_balance: string;
    usdc_allowance: string | null;
    block_number: number;
    updated_at: string;
  } | null;
};

const USDC_DECIMALS = 6;

function formatUsdc(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    const n = BigInt(raw);
    const base = BigInt(10) ** BigInt(USDC_DECIMALS);
    const whole = n / base;
    const frac = n % base;
    const fracStr = frac.toString().padStart(USDC_DECIMALS, "0").slice(0, 4);
    return `${whole.toLocaleString()}.${fracStr}`;
  } catch {
    return raw;
  }
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function BalancesTab({ dpmUrl }: { dpmUrl: string }) {
  // --- List state ---
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Per-row sync state ---
  const [syncing, setSyncing] = useState<Record<number, boolean>>({});
  const [rowError, setRowError] = useState<Record<number, string>>({});

  // --- Bulk backfill state ---
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  // --- Token balance sync state ---
  const [tokenSyncing, setTokenSyncing] = useState<Record<number, boolean>>({});
  const [tokenSyncResult, setTokenSyncResult] = useState<Record<number, any>>({});

  // --- Token balance lookup state (DB + on-chain comparison) ---
  const [tbUserId, setTbUserId] = useState("");
  const [tbTokenId, setTbTokenId] = useState("");
  const [tbLoading, setTbLoading] = useState(false);
  const [tbError, setTbError] = useState<string | null>(null);
  const [tbDbBalances, setTbDbBalances] = useState<any[] | null>(null);
  const [tbDbAddress, setTbDbAddress] = useState<string | null>(null);
  const [tbOnchain, setTbOnchain] = useState<any | null>(null);
  const [tbOnchainLoading, setTbOnchainLoading] = useState(false);
  const [tbSyncing, setTbSyncing] = useState(false);
  const [tbSyncResult, setTbSyncResult] = useState<any | null>(null);

  // --- Ad-hoc lookup state ---
  const [lookupAddress, setLookupAddress] = useState("");
  const [lookupTokenId, setLookupTokenId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [collateralResult, setCollateralResult] = useState<any | null>(null);
  const [ctfResult, setCtfResult] = useState<any | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listUsers(dpmUrl, {
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      search: debouncedSearch,
      has_proxy: "true",
    });
    if (res.success) {
      setUsers(res.data.data || []);
      setTotal(res.data.total || 0);
    } else {
      setError(res.error);
      setUsers([]);
      setTotal(0);
    }
    setLoading(false);
  }, [dpmUrl, page, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to first page when the search changes.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  async function handleSyncRow(userId: number) {
    setSyncing((s) => ({ ...s, [userId]: true }));
    setRowError((e) => {
      const next = { ...e };
      delete next[userId];
      return next;
    });
    const res = await syncCollateralUser(dpmUrl, userId);
    if (res.success) {
      await fetchUsers();
    } else {
      setRowError((e) => ({ ...e, [userId]: res.error }));
    }
    setSyncing((s) => {
      const next = { ...s };
      delete next[userId];
      return next;
    });
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillError(null);
    setBackfillResult(null);
    const res = await backfillCollateral(dpmUrl);
    if (res.success) {
      setBackfillResult(res.data);
      await fetchUsers();
    } else {
      setBackfillError(res.error);
    }
    setBackfilling(false);
  }

  async function handleSyncOrderTokens(userId: number) {
    setTokenSyncing((s) => ({ ...s, [userId]: true }));
    setRowError((e) => {
      const next = { ...e };
      delete next[userId];
      return next;
    });
    setTokenSyncResult((r) => {
      const next = { ...r };
      delete next[userId];
      return next;
    });
    const res = await syncUserTokenBalancesFromOrders(dpmUrl, userId);
    if (res.success) {
      setTokenSyncResult((r) => ({ ...r, [userId]: res.data }));
    } else {
      setRowError((e) => ({ ...e, [userId]: res.error }));
    }
    setTokenSyncing((s) => {
      const next = { ...s };
      delete next[userId];
      return next;
    });
  }

  async function handleFetchDbTokenBalances() {
    const uid = parseInt(tbUserId, 10);
    if (!uid || uid <= 0) return;
    setTbLoading(true);
    setTbError(null);
    setTbDbBalances(null);
    setTbDbAddress(null);
    setTbOnchain(null);
    setTbSyncResult(null);
    const res = await getUserTokenBalances(dpmUrl, uid);
    if (res.success) {
      setTbDbBalances(res.data.balances || []);
      setTbDbAddress(res.data.address || null);
    } else {
      setTbError(res.error);
    }
    setTbLoading(false);
  }

  async function handleFetchOnchainForToken() {
    if (!tbDbAddress || !tbTokenId) return;
    setTbOnchainLoading(true);
    setTbOnchain(null);
    const res = await getConditionalTokenBalance(dpmUrl, tbDbAddress, tbTokenId);
    if (res.success) {
      setTbOnchain(res.data);
    } else {
      setTbError(res.error);
    }
    setTbOnchainLoading(false);
  }

  async function handleSyncSpecificToken() {
    const uid = parseInt(tbUserId, 10);
    if (!uid || uid <= 0 || !tbTokenId) return;
    setTbSyncing(true);
    setTbSyncResult(null);
    const res = await syncUserTokenBalance(dpmUrl, uid, tbTokenId);
    if (res.success) {
      setTbSyncResult(res.data);
      await handleFetchDbTokenBalances();
    } else {
      setTbError(res.error);
    }
    setTbSyncing(false);
  }

  async function handleLookup() {
    if (!lookupAddress) return;
    setLookupLoading(true);
    setLookupError(null);
    setCollateralResult(null);
    setCtfResult(null);

    const collateralPromise = getCollateralBalance(dpmUrl, lookupAddress);
    const ctfPromise = lookupTokenId
      ? getConditionalTokenBalance(dpmUrl, lookupAddress, lookupTokenId)
      : Promise.resolve(null);

    const [collateralRes, ctfRes] = await Promise.all([collateralPromise, ctfPromise]);

    let firstError: string | null = null;
    if (collateralRes.success) {
      setCollateralResult(collateralRes.data);
    } else {
      firstError = collateralRes.error;
    }
    if (ctfRes && "success" in ctfRes) {
      if (ctfRes.success) {
        setCtfResult(ctfRes.data);
      } else if (!firstError) {
        firstError = ctfRes.error;
      }
    }
    if (firstError) setLookupError(firstError);
    setLookupLoading(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Users table */}
      <Card
        title={`User Balances${total ? ` (${total})` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              size="sm"
              onClick={handleBackfill}
              disabled={backfilling}
            >
              {backfilling ? "Backfilling..." : "Backfill Missing"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Users with a proxy wallet and their cached on-chain USDC balance.
            &quot;Refresh&quot; re-reads a single user from chain; &quot;Backfill Missing&quot;
            pulls balances for every user that has no cached row yet.
          </p>

          <Input
            placeholder="Search by address, proxy wallet, name, pseudonym or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 font-mono text-xs"
          />

          {error && <ErrorBox error={error} />}

          {backfillError && <ErrorBox error={backfillError} />}
          {backfillResult && (
            <SuccessBox>
              <p className="text-sm text-green-800 dark:text-green-200">
                Backfill complete · total={backfillResult.total} missing=
                {backfillResult.missing} succeeded={backfillResult.succeeded}{" "}
                failed={backfillResult.failed}
              </p>
            </SuccessBox>
          )}

          {loading && users.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No users found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-500">ID</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Name</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Proxy Wallet</th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-500">
                      USDC Balance
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-500">
                      Allowance
                    </th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Block</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Updated</th>
                    <th className="px-3 py-2 font-medium text-zinc-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.map((u) => {
                    const missing = u.balance === null;
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td className="px-3 py-2 font-mono text-zinc-500">{u.id}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {u.name || u.pseudonym || "—"}
                            </span>
                            {u.email && (
                              <span className="text-zinc-400">{u.email}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLookupAddress(u.proxy_wallet);
                              navigator.clipboard
                                ?.writeText(u.proxy_wallet)
                                .catch(() => {});
                            }}
                            className="font-mono text-zinc-700 hover:underline dark:text-zinc-300"
                            title={u.proxy_wallet}
                          >
                            {shortAddr(u.proxy_wallet)}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {missing ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              no cache
                            </Badge>
                          ) : (
                            formatUsdc(u.balance!.usdc_balance)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-500">
                          {missing ? "—" : formatUsdc(u.balance!.usdc_allowance)}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-500">
                          {missing ? "—" : u.balance!.block_number}
                        </td>
                        <td className="px-3 py-2 text-zinc-500">
                          {missing ? "—" : timeAgo(u.balance!.updated_at)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!!syncing[u.id] || !!tokenSyncing[u.id]}
                                onClick={() => handleSyncRow(u.id)}
                              >
                                {syncing[u.id] ? "Syncing..." : "Refresh"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!!syncing[u.id] || !!tokenSyncing[u.id]}
                                onClick={() => handleSyncOrderTokens(u.id)}
                              >
                                {tokenSyncing[u.id] ? "Syncing..." : "Sync Tokens"}
                              </Button>
                            </div>
                            {tokenSyncResult[u.id] && (
                              <span className="text-[10px] text-green-600">
                                {tokenSyncResult[u.id].synced?.length || 0} token(s) synced
                                {tokenSyncResult[u.id].errors?.length
                                  ? `, ${tokenSyncResult[u.id].errors.length} error(s)`
                                  : ""}
                              </span>
                            )}
                            {rowError[u.id] && (
                              <span className="max-w-[180px] truncate text-[10px] text-red-500">
                                {rowError[u.id]}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Token balances — DB view + on-chain comparison + sync */}
      <Card title="Token Balances">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            View cached token balances from the database, compare with on-chain
            values, and sync specific tokens. Enter a user ID to load their DB
            balances, then optionally enter a token ID to compare with on-chain.
          </p>

          {/* Step 1: Load DB balances for a user */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs font-medium">
                User ID <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. 42"
                value={tbUserId}
                onChange={(e) => setTbUserId(e.target.value.trim())}
                onKeyDown={(e) => e.key === "Enter" && handleFetchDbTokenBalances()}
                className="mt-1 h-8 text-xs"
              />
            </div>
            <Button
              onClick={handleFetchDbTokenBalances}
              disabled={!tbUserId || tbLoading}
              size="sm"
            >
              {tbLoading ? "Loading..." : "Load DB Balances"}
            </Button>
          </div>

          {tbError && <ErrorBox error={tbError} />}

          {/* DB balances table */}
          {tbDbBalances !== null && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  DB
                </Badge>
                <span className="text-xs text-zinc-500">
                  {tbDbBalances.length} cached token balance(s)
                  {tbDbAddress && (
                    <span className="ml-1 font-mono">
                      for {shortAddr(tbDbAddress)}
                    </span>
                  )}
                </span>
              </div>
              {tbDbBalances.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-400">
                  No cached token balances. Use &quot;Sync Tokens&quot; on the user row
                  above, or sync a specific token below.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                      <tr>
                        <th className="px-3 py-2 font-medium text-zinc-500">Token ID</th>
                        <th className="px-3 py-2 text-right font-medium text-zinc-500">
                          DB Balance
                        </th>
                        <th className="px-3 py-2 font-medium text-zinc-500">Block</th>
                        <th className="px-3 py-2 font-medium text-zinc-500">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {tbDbBalances.map((b: any) => (
                        <tr
                          key={b.token_id}
                          className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                          onClick={() => setTbTokenId(b.token_id)}
                        >
                          <td className="px-3 py-2 font-mono">
                            {b.token_id.length > 20
                              ? `${b.token_id.slice(0, 10)}...${b.token_id.slice(-8)}`
                              : b.token_id}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {b.balance}
                          </td>
                          <td className="px-3 py-2 font-mono text-zinc-500">
                            {b.block_number}
                          </td>
                          <td className="px-3 py-2 text-zinc-500">
                            {timeAgo(b.updated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Compare specific token — on-chain vs DB */}
          {tbDbBalances !== null && (
            <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Compare &amp; Sync Specific Token
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs font-medium">Token ID</Label>
                  <Input
                    placeholder="Click a row above or enter token ID..."
                    value={tbTokenId}
                    onChange={(e) => setTbTokenId(e.target.value.trim())}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchOnchainForToken}
                  disabled={!tbTokenId || !tbDbAddress || tbOnchainLoading}
                >
                  {tbOnchainLoading ? "Fetching..." : "Check On-chain"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSyncSpecificToken}
                  disabled={!tbTokenId || !tbUserId || tbSyncing}
                >
                  {tbSyncing ? "Syncing..." : "Sync to DB"}
                </Button>
              </div>

              {/* Show comparison */}
              {tbTokenId && (tbOnchain || tbDbBalances) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950">
                    <div className="flex items-center gap-1">
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        DB
                      </Badge>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400">
                        Cached Balance
                      </span>
                    </div>
                    <code className="mt-1 block font-mono text-sm">
                      {tbDbBalances.find(
                        (b: any) => b.token_id === tbTokenId
                      )?.balance ?? "—"}
                    </code>
                    <p className="mt-1 text-[10px] text-blue-500">
                      block:{" "}
                      {tbDbBalances.find(
                        (b: any) => b.token_id === tbTokenId
                      )?.block_number ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950">
                    <div className="flex items-center gap-1">
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        On-chain
                      </Badge>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        Live Balance
                      </span>
                    </div>
                    <code className="mt-1 block font-mono text-sm">
                      {tbOnchain ? tbOnchain.balance : "—"}
                    </code>
                    <p className="mt-1 text-[10px] text-emerald-500">
                      {tbOnchain
                        ? "fetched just now"
                        : "click \"Check On-chain\" to fetch"}
                    </p>
                  </div>
                </div>
              )}

              {tbSyncResult && (
                <SuccessBox>
                  <p className="text-xs text-green-800 dark:text-green-200">
                    Synced token {tbSyncResult.synced?.[0]?.token_id} — DB
                    balance updated to {tbSyncResult.synced?.[0]?.balance}
                  </p>
                </SuccessBox>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Ad-hoc on-chain lookup */}
      <Card title="On-chain Lookup by Address">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Query <strong>on-chain</strong> balances directly for any address
            (reads from the blockchain, not the database). USDC balance is always
            fetched; provide a token ID to also fetch a conditional token
            (ERC-1155) balance.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs font-medium">
                Address <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="0x..."
                value={lookupAddress}
                onChange={(e) => setLookupAddress(e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">
                Conditional Token ID (optional)
              </Label>
              <Input
                placeholder="Numeric token ID..."
                value={lookupTokenId}
                onChange={(e) => setLookupTokenId(e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleLookup}
            disabled={!lookupAddress || lookupLoading}
            className="w-full"
          >
            {lookupLoading ? "Fetching..." : "Fetch Balances"}
          </Button>

          {lookupError && <ErrorBox error={lookupError} />}

          {collateralResult && (
            <SuccessBox>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    USDC Balance (on-chain)
                  </Label>
                  <code className="mt-1 block rounded bg-white px-3 py-2 font-mono text-lg dark:bg-zinc-900">
                    {collateralResult.balance_normalized}
                  </code>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  <div>
                    <span className="text-green-700 dark:text-green-300">Raw: </span>
                    <span className="font-mono text-green-800 dark:text-green-200">
                      {collateralResult.balance_raw}
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700 dark:text-green-300">Decimals: </span>
                    <span className="font-mono text-green-800 dark:text-green-200">
                      {collateralResult.decimals}
                    </span>
                  </div>
                </div>
              </div>
            </SuccessBox>
          )}

          {ctfResult && (
            <SuccessBox>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                  Conditional Token Balance (on-chain)
                </Label>
                <code className="block rounded bg-white px-3 py-2 font-mono text-sm dark:bg-zinc-900">
                  {ctfResult.balance}
                </code>
                <p className="font-mono text-[10px] text-green-700 dark:text-green-300">
                  token_id: {ctfResult.token_id}
                </p>
              </div>
            </SuccessBox>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treasury Tab
// ---------------------------------------------------------------------------

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function parseAddresses(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function TxHashLine({ hash }: { hash: string }) {
  return (
    <p className="break-all font-mono text-xs text-green-800 dark:text-green-200">
      tx: {hash}
    </p>
  );
}

function TreasuryTab() {
  const collateralAddress = process.env.NEXT_PUBLIC_COLLATERAL_ADDRESS ?? "";

  // --- Balances ---
  const [balAddresses, setBalAddresses] = useState("");
  const [balToken, setBalToken] = useState<"native" | "collateral" | "custom">("native");
  const [balCustomToken, setBalCustomToken] = useState("");
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);
  const [balResults, setBalResults] = useState<any[] | null>(null);

  // --- Role check ---
  const [roleCheckAddr, setRoleCheckAddr] = useState("");
  const [roleCheckRole, setRoleCheckRole] = useState<"admin" | "operator">("operator");
  const [roleCheckLoading, setRoleCheckLoading] = useState(false);
  const [roleCheckError, setRoleCheckError] = useState<string | null>(null);
  const [roleCheckResult, setRoleCheckResult] = useState<any | null>(null);

  // --- Role management ---
  const [roleAddresses, setRoleAddresses] = useState("");
  const [roleAction, setRoleAction] = useState<"grantOperator" | "revokeOperator" | "grantAdmin" | "revokeAdmin">("grantOperator");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleResult, setRoleResult] = useState<string | null>(null);

  // --- Withdraw ---
  const [wdEthLoading, setWdEthLoading] = useState(false);
  const [wdEthError, setWdEthError] = useState<string | null>(null);
  const [wdEthResult, setWdEthResult] = useState<string | null>(null);

  const [wdTokenAddr, setWdTokenAddr] = useState("");
  const [wdTokenAmount, setWdTokenAmount] = useState("");
  const [wdTokenLoading, setWdTokenLoading] = useState(false);
  const [wdTokenError, setWdTokenError] = useState<string | null>(null);
  const [wdTokenResult, setWdTokenResult] = useState<string | null>(null);

  function resolvedTokenAddress(): string {
    if (balToken === "native") return ZERO_ADDR;
    if (balToken === "collateral") return collateralAddress || ZERO_ADDR;
    return balCustomToken.trim();
  }

  async function handleGetBalances() {
    setBalLoading(true);
    setBalError(null);
    setBalResults(null);
    const addresses = parseAddresses(balAddresses);
    if (addresses.length === 0) {
      setBalError("Enter at least one address");
      setBalLoading(false);
      return;
    }
    const res = await treasuryGetBalances(addresses, resolvedTokenAddress());
    if (res.success) {
      setBalResults(res.data);
    } else {
      setBalError(res.error);
    }
    setBalLoading(false);
  }

  async function handleRoleCheck() {
    setRoleCheckLoading(true);
    setRoleCheckError(null);
    setRoleCheckResult(null);
    const res = await treasuryHasRole(roleCheckRole, roleCheckAddr.trim());
    if (res.success) {
      setRoleCheckResult(res.data);
    } else {
      setRoleCheckError(res.error);
    }
    setRoleCheckLoading(false);
  }

  async function handleRoleAction() {
    setRoleLoading(true);
    setRoleError(null);
    setRoleResult(null);
    const addresses = parseAddresses(roleAddresses);
    if (addresses.length === 0) {
      setRoleError("Enter at least one address");
      setRoleLoading(false);
      return;
    }
    const fn =
      roleAction === "grantOperator" ? treasuryGrantOperatorRole
      : roleAction === "revokeOperator" ? treasuryRevokeOperatorRole
      : roleAction === "grantAdmin" ? treasuryGrantAdminRole
      : treasuryRevokeAdminRole;
    const res = await fn(addresses);
    if (res.success) {
      setRoleResult(res.txHash);
    } else {
      setRoleError(res.error);
    }
    setRoleLoading(false);
  }

  async function handleWithdrawETH() {
    setWdEthLoading(true);
    setWdEthError(null);
    setWdEthResult(null);
    const res = await treasuryWithdrawETH();
    if (res.success) {
      setWdEthResult(res.txHash);
    } else {
      setWdEthError(res.error);
    }
    setWdEthLoading(false);
  }

  async function handleWithdrawToken() {
    setWdTokenLoading(true);
    setWdTokenError(null);
    setWdTokenResult(null);
    if (!wdTokenAddr.trim()) {
      setWdTokenError("Token address required");
      setWdTokenLoading(false);
      return;
    }
    if (!wdTokenAmount.trim() || !/^\d+$/.test(wdTokenAmount.trim())) {
      setWdTokenError("Amount must be a positive integer (raw wei / base units)");
      setWdTokenLoading(false);
      return;
    }
    const res = await treasuryWithdrawToken(wdTokenAddr.trim(), wdTokenAmount.trim());
    if (res.success) {
      setWdTokenResult(res.txHash);
    } else {
      setWdTokenError(res.error);
    }
    setWdTokenLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Balances */}
      <Card title="Get Balances">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Calls <code>Treasury.getBalancesAndAllowances</code> — single eth_call for any set
            of addresses. Reads native (POL) or ERC-20 balance per address.
          </p>

          <div>
            <Label className="text-xs font-medium">
              Addresses <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-zinc-400">One per line, or comma-separated</p>
            <textarea
              value={balAddresses}
              onChange={(e) => setBalAddresses(e.target.value)}
              placeholder={"0x...\n0x..."}
              rows={4}
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Token</Label>
            <div className="mt-1 flex gap-2">
              <select
                value={balToken}
                onChange={(e) => setBalToken(e.target.value as any)}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="native">Native (POL)</option>
                <option value="collateral">USDC.e (collateral)</option>
                <option value="custom">Custom address…</option>
              </select>
              {balToken === "custom" && (
                <Input
                  placeholder="0x token address"
                  value={balCustomToken}
                  onChange={(e) => setBalCustomToken(e.target.value.trim())}
                  className="h-8 flex-1 font-mono text-xs"
                />
              )}
            </div>
          </div>

          <Button
            onClick={handleGetBalances}
            disabled={!balAddresses.trim() || balLoading}
            className="w-full"
          >
            {balLoading ? "Fetching…" : "Get Balances"}
          </Button>

          {balError && <ErrorBox error={balError} />}

          {balResults && balResults.length > 0 && (
            <SuccessBox>
              <div className="overflow-x-auto rounded-md border border-green-200 dark:border-green-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                    <tr>
                      <th className="px-3 py-2 font-medium text-green-700 dark:text-green-300">Address</th>
                      <th className="px-3 py-2 font-medium text-green-700 dark:text-green-300">Balance (formatted)</th>
                      <th className="px-3 py-2 font-medium text-green-700 dark:text-green-300">Balance (raw)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100 dark:divide-green-900">
                    {balResults.map((r) => (
                      <tr key={r.address}>
                        <td className="px-3 py-2 font-mono text-green-800 dark:text-green-200">{r.address}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-green-800 dark:text-green-200">{r.balanceFormatted}</td>
                        <td className="px-3 py-2 font-mono text-green-700 dark:text-green-300">{r.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SuccessBox>
          )}
        </div>
      </Card>

      {/* Role check */}
      <Card title="Check Role">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Check whether an address holds the Admin or Operator role on the Treasury contract.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Address <span className="text-red-500">*</span></Label>
              <Input
                placeholder="0x..."
                value={roleCheckAddr}
                onChange={(e) => setRoleCheckAddr(e.target.value.trim())}
                className="mt-1 h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Role</Label>
              <select
                value={roleCheckRole}
                onChange={(e) => setRoleCheckRole(e.target.value as any)}
                className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="operator">OPERATOR_ROLE</option>
                <option value="admin">ADMIN_ROLE</option>
              </select>
            </div>
          </div>
          <Button
            onClick={handleRoleCheck}
            disabled={!roleCheckAddr.trim() || roleCheckLoading}
            className="w-full"
          >
            {roleCheckLoading ? "Checking…" : "Check Role"}
          </Button>
          {roleCheckError && <ErrorBox error={roleCheckError} />}
          {roleCheckResult && (
            <SuccessBox>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {roleCheckResult.address}
              </p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                {roleCheckResult.role.toUpperCase()}_ROLE:{" "}
                <span className={`font-semibold ${roleCheckResult.hasRole ? "text-green-600" : "text-red-500"}`}>
                  {roleCheckResult.hasRole ? "✓ granted" : "✗ not granted"}
                </span>
              </p>
            </SuccessBox>
          )}
        </div>
      </Card>

      {/* Role management */}
      <Card title="Role Management">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Grant or revoke operator / admin roles. Signed by{" "}
            <code className="text-xs">TREASURY_ADMIN_PRIVATE_KEY</code>. Admin key required.
          </p>

          <div>
            <Label className="text-xs font-medium">Action</Label>
            <select
              value={roleAction}
              onChange={(e) => {
                setRoleAction(e.target.value as any);
                setRoleError(null);
                setRoleResult(null);
              }}
              className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="grantOperator">Grant OPERATOR_ROLE</option>
              <option value="revokeOperator">Revoke OPERATOR_ROLE</option>
              <option value="grantAdmin">Grant ADMIN_ROLE</option>
              <option value="revokeAdmin">Revoke ADMIN_ROLE</option>
            </select>
          </div>

          <div>
            <Label className="text-xs font-medium">
              Addresses <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-zinc-400">One per line, or comma-separated</p>
            <textarea
              value={roleAddresses}
              onChange={(e) => setRoleAddresses(e.target.value)}
              placeholder="0x..."
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <Button
            onClick={handleRoleAction}
            disabled={!roleAddresses.trim() || roleLoading}
            className="w-full"
            variant={roleAction.startsWith("revoke") ? "destructive" : "default"}
          >
            {roleLoading ? "Submitting…" : roleAction === "grantOperator" ? "Grant Operator Role"
              : roleAction === "revokeOperator" ? "Revoke Operator Role"
              : roleAction === "grantAdmin" ? "Grant Admin Role"
              : "Revoke Admin Role"}
          </Button>

          {roleError && <ErrorBox error={roleError} />}
          {roleResult && (
            <SuccessBox>
              <p className="text-xs font-medium text-green-800 dark:text-green-200">Role updated</p>
              <TxHashLine hash={roleResult} />
            </SuccessBox>
          )}
        </div>
      </Card>

      {/* Emergency Withdraw */}
      <Card title="Emergency Withdraw">
        <div className="space-y-6">
          <p className="text-xs text-zinc-500">
            Drain contract funds to the caller (signed by{" "}
            <code className="text-xs">TREASURY_ADMIN_PRIVATE_KEY</code>). Admin role required.
          </p>

          {/* Withdraw ETH */}
          <div className="space-y-3">
            <p className="text-xs font-medium">Withdraw all native POL</p>
            <Button
              onClick={handleWithdrawETH}
              disabled={wdEthLoading}
              variant="destructive"
              className="w-full"
            >
              {wdEthLoading ? "Withdrawing…" : "Withdraw ETH (all)"}
            </Button>
            {wdEthError && <ErrorBox error={wdEthError} />}
            {wdEthResult && (
              <SuccessBox>
                <p className="text-xs font-medium text-green-800 dark:text-green-200">ETH withdrawn</p>
                <TxHashLine hash={wdEthResult} />
              </SuccessBox>
            )}
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Withdraw token */}
          <div className="space-y-3">
            <p className="text-xs font-medium">Withdraw ERC-20 token</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Token address <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="0x..."
                  value={wdTokenAddr}
                  onChange={(e) => setWdTokenAddr(e.target.value.trim())}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Amount (raw base units) <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. 50000000 for 50 USDC.e"
                  value={wdTokenAmount}
                  onChange={(e) => setWdTokenAmount(e.target.value.trim())}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            </div>
            <Button
              onClick={handleWithdrawToken}
              disabled={!wdTokenAddr.trim() || !wdTokenAmount.trim() || wdTokenLoading}
              variant="destructive"
              className="w-full"
            >
              {wdTokenLoading ? "Withdrawing…" : "Withdraw Token"}
            </Button>
            {wdTokenError && <ErrorBox error={wdTokenError} />}
            {wdTokenResult && (
              <SuccessBox>
                <p className="text-xs font-medium text-green-800 dark:text-green-200">Token withdrawn</p>
                <TxHashLine hash={wdTokenResult} />
              </SuccessBox>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contracts Tab
// ---------------------------------------------------------------------------

const KNOWN_CONTRACTS: { address: string; name: string; contract_type: string }[] = [
  { address: "0x9b4A302A548c7e313c2b74C461db7b84d3074A84", name: "USDC.e", contract_type: "usdc_e" },
  { address: "0x41cf0Cc822DDA607457cc5429FeEAc62A1Fb0ec1", name: "Conditional Tokens", contract_type: "conditional_tokens" },
  { address: "0xF740e33A790E31745CdCaC2e173E7B4585C172F9", name: "CTF Exchange", contract_type: "ctf_exchange" },
  { address: "0xE34B1b9f36e8779546cE212f968e36916b9E1576", name: "Fee Module", contract_type: "fee_module" },
  { address: "0xA27381a00A41fBb8f44Ee36884EeDD521895817c", name: "UMA CTF Adapter", contract_type: "uma_ctf_adapter" },
  { address: "0xd4A98869e9711338535AfE76EB736a1127cbA60f", name: "Managed Oracle", contract_type: "managed_oracle" },
  { address: "0xbab7940F8a713C4e64CbCfeEC85FEDb8fEecC225", name: "CTF Oracle", contract_type: "ctf_oracle" },
  { address: "0x5D525Ab2C7F2eEEB345972405005949F69de08bA", name: "Treasury", contract_type: "treasury" },
];

function ContractsTab({ dpmUrl }: { dpmUrl: string }) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listContracts(dpmUrl);
    if (res.success) {
      setContracts(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [dpmUrl]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const existingAddresses = new Set(
    contracts.map((c) => c.address?.toLowerCase())
  );

  const missingContracts = KNOWN_CONTRACTS.filter(
    (kc) => !existingAddresses.has(kc.address.toLowerCase())
  );

  async function handleAdd(contract: typeof KNOWN_CONTRACTS[number]) {
    setAdding(contract.address);
    setAddError(null);
    setAddSuccess(null);
    const res = await createContract(dpmUrl, contract);
    if (res.success) {
      setAddSuccess(`Added ${contract.name}`);
      await fetchContracts();
    } else {
      setAddError(res.error);
    }
    setAdding(null);
  }

  async function handleAddAll() {
    setBulkAdding(true);
    setAddError(null);
    setAddSuccess(null);
    let added = 0;
    for (const contract of missingContracts) {
      const res = await createContract(dpmUrl, contract);
      if (res.success) {
        added++;
      } else {
        setAddError(`Failed on ${contract.name}: ${res.error}`);
        break;
      }
    }
    if (added > 0) {
      setAddSuccess(`Added ${added} contract${added > 1 ? "s" : ""}`);
      await fetchContracts();
    }
    setBulkAdding(false);
  }

  const typeColors: Record<string, string> = {
    usdc_e: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    conditional_tokens: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    ctf_exchange: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    fee_module: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    uma_ctf_adapter: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    managed_oracle: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    ctf_oracle: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    treasury: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  };

  return (
    <div className="space-y-4">
      {/* Add Contracts */}
      {missingContracts.length > 0 && (
        <Card
          title="Add Contracts"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddAll}
              disabled={bulkAdding || adding !== null}
            >
              {bulkAdding ? "Adding..." : `Add All (${missingContracts.length})`}
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              These contracts are not yet in the database. Click to add individually or use &quot;Add All&quot;.
            </p>
            <div className="space-y-2">
              {missingContracts.map((kc) => (
                <div
                  key={kc.address}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-2.5 dark:border-zinc-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{kc.name}</span>
                      <Badge className={typeColors[kc.contract_type] || "bg-zinc-100 text-zinc-800"}>
                        {kc.contract_type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                      {kc.address}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-4 shrink-0"
                    onClick={() => handleAdd(kc)}
                    disabled={adding !== null || bulkAdding}
                  >
                    {adding === kc.address ? "Adding..." : "Add"}
                  </Button>
                </div>
              ))}
            </div>
            {addError && <ErrorBox error={addError} />}
            {addSuccess && <SuccessBox><p className="text-sm text-green-800 dark:text-green-200">{addSuccess}</p></SuccessBox>}
          </div>
        </Card>
      )}

      {/* Existing Contracts Table */}
      <Card
        title="Contracts"
        actions={
          <Button variant="outline" size="sm" onClick={fetchContracts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        <div className="space-y-3">
          {error && <ErrorBox error={error} />}

          {loading && contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : contracts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No contracts found. Add contracts above to populate the table.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-500">ID</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Name</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Address</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Type</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {contracts.map((c: any) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-3 py-2 font-mono text-zinc-500">{c.id}</td>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 font-mono">{c.address}</td>
                      <td className="px-3 py-2">
                        <Badge className={typeColors[c.contract_type] || "bg-zinc-100 text-zinc-800"}>
                          {c.contract_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && contracts.length > 0 && missingContracts.length === 0 && (
            <p className="text-center text-xs text-green-600 dark:text-green-400">
              All known contracts are registered.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag Search Select — typeahead multi-select used by Create Event form
// ---------------------------------------------------------------------------

interface TagOption {
  id: number;
  label: string;
  slug: string;
}

function TagSearchSelect({
  gammaUrl,
  selected,
  onChange,
}: {
  gammaUrl: string;
  selected: TagOption[];
  onChange: (next: TagOption[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await listTags(gammaUrl, { limit: "20", search });
      if (cancelled) return;
      if (res.success) {
        const items: TagOption[] = (res.data?.data ?? []).map((t: any) => ({
          id: t.id,
          label: t.label,
          slug: t.slug,
        }));
        setResults(items);
      } else {
        setError(res.error);
      }
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, gammaUrl]);

  const selectedIds = new Set(selected.map((t) => t.id));
  const filteredResults = results.filter((t) => !selectedIds.has(t.id));

  function add(tag: TagOption) {
    onChange([...selected, tag]);
    setSearch("");
  }

  function remove(id: number) {
    onChange(selected.filter((t) => t.id !== id));
  }

  return (
    <div className="relative">
      {selected.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {selected.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1 pr-1 text-xs">
              {t.label}
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="rounded-sm px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                aria-label={`Remove ${t.label}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        placeholder="Search tags by label or slug..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-8 text-xs"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          {loading && (
            <p className="px-3 py-2 text-xs text-zinc-400">Searching...</p>
          )}
          {error && (
            <p className="px-3 py-2 text-xs text-red-500">{error}</p>
          )}
          {!loading && !error && filteredResults.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-400">
              {search ? "No matching tags" : "No tags yet"}
            </p>
          )}
          {!loading &&
            !error &&
            filteredResults.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(t)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{t.label}</span>
                <span className="ml-2 truncate font-mono text-[10px] text-zinc-500">
                  {t.slug}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tags Tab — view, search, create
// ---------------------------------------------------------------------------

function TagsTab({ gammaUrl, dpmUrl }: { gammaUrl: string; dpmUrl: string }) {
  const [tags, setTags] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newForceShow, setNewForceShow] = useState(false);
  const [newForceHide, setNewForceHide] = useState(false);
  const [newRequiresTranslation, setNewRequiresTranslation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listTags(gammaUrl, {
      limit: String(limit),
      offset: String(page * limit),
      search,
    });
    if (res.success) {
      setTags(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [gammaUrl, page, search]);

  useEffect(() => {
    const t = setTimeout(() => fetchTags(), 200);
    return () => clearTimeout(t);
  }, [fetchTags]);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    const res = await createTag(dpmUrl, {
      slug: newSlug,
      label: newLabel,
      force_show: newForceShow,
      force_hide: newForceHide,
      requires_translation: newRequiresTranslation,
    });
    if (res.success) {
      setCreateSuccess(`Created tag "${res.data?.label}"`);
      setNewSlug("");
      setNewLabel("");
      setNewForceShow(false);
      setNewForceHide(false);
      setNewRequiresTranslation(false);
      await fetchTags();
    } else {
      setCreateError(res.error);
    }
    setCreating(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canCreate = newSlug.trim() && newLabel.trim() && !creating;

  return (
    <div className="space-y-4">
      <Card
        title="Create Tag"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Hide" : "Show"}
          </Button>
        }
      >
        {showCreate ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Upserts by slug — sending an existing slug returns the existing tag unchanged.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Slug <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="tag-slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.trim())}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Label <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Display label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newForceShow}
                  onChange={(e) => setNewForceShow(e.target.checked)}
                />
                Force Show
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newForceHide}
                  onChange={(e) => setNewForceHide(e.target.checked)}
                />
                Force Hide
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={newRequiresTranslation}
                  onChange={(e) => setNewRequiresTranslation(e.target.checked)}
                />
                Requires Translation
              </label>
            </div>
            <Button onClick={handleCreate} disabled={!canCreate} className="w-full">
              {creating ? "Creating..." : "Create Tag"}
            </Button>
            {createError && <ErrorBox error={createError} />}
            {createSuccess && (
              <SuccessBox>
                <p className="text-sm text-green-800 dark:text-green-200">{createSuccess}</p>
              </SuccessBox>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Click &quot;Show&quot; to add a new tag.</p>
        )}
      </Card>

      <Card
        title={`Tags${total > 0 ? ` (${total})` : ""}`}
        actions={
          <Button variant="outline" size="sm" onClick={fetchTags} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Search by label or slug..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 text-xs"
          />

          {error && <ErrorBox error={error} />}

          {loading && tags.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : tags.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              {search ? "No matching tags" : "No tags yet"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-500">ID</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Label</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Slug</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Flags</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">External ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {tags.map((t: any) => (
                    <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-3 py-2 font-mono text-zinc-500">{t.id}</td>
                      <td className="px-3 py-2 font-medium">{t.label}</td>
                      <td className="px-3 py-2 font-mono">{t.slug}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <BoolBadge value={t.force_show} label="show" />
                          <BoolBadge value={t.force_hide} label="hide" />
                          <BoolBadge value={t.requires_translation} label="i18n" />
                        </div>
                      </td>
                      <td className="px-3 py-2 truncate font-mono text-[10px] text-zinc-500">
                        {t.external_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= totalPages || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series Search Select — single-select dropdown used by Create Event form.
// Stores the series external UUID, which dpm-api accepts as series_external_id.
// ---------------------------------------------------------------------------

interface SeriesOption {
  external_id: string;
  title: string;
  slug: string;
}

function SeriesSearchSelect({
  gammaUrl,
  selected,
  onChange,
}: {
  gammaUrl: string;
  selected: SeriesOption | null;
  onChange: (next: SeriesOption | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SeriesOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await listSeries(gammaUrl, { limit: "20", search });
      if (cancelled) return;
      if (res.success) {
        setResults(
          (res.data?.data ?? []).map((s: any) => ({
            external_id: s.external_id,
            title: s.title,
            slug: s.slug,
          })),
        );
      } else {
        setError(res.error);
      }
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, gammaUrl]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{selected.title}</p>
          <p className="truncate font-mono text-[10px] text-zinc-500">
            {selected.slug}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-sm px-2 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search series by title or slug..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-8 text-xs"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          {loading && (
            <p className="px-3 py-2 text-xs text-zinc-400">Searching...</p>
          )}
          {error && <p className="px-3 py-2 text-xs text-red-500">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-400">
              {search ? "No matching series" : "No series yet"}
            </p>
          )}
          {!loading &&
            !error &&
            results.map((s) => (
              <button
                key={s.external_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{s.title}</span>
                <span className="ml-2 truncate font-mono text-[10px] text-zinc-500">
                  {s.slug}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Series Tab — view, search, create.
// Reads from gamma; writes go through dpm-api (POST /series).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Create-From-Slug Tab — paste a Polymarket slug, Gemini adapts the response
// into our Series/Event/Markets payloads, user edits and submits in sequence.
// ---------------------------------------------------------------------------

type AdaptedSeries = {
  slug: string;
  title: string;
  ticker?: string;
  description?: string;
  icon?: string;
  series_type?: string;
  recurrence?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted: boolean;
  featured: boolean;
  new: boolean;
  requires_translation: boolean;
  comment_count?: number;
  metadata_type?: string;
  metadata?: Record<string, any>;
};

type AdaptedEvent = {
  slug: string;
  title: string;
  ticker?: string;
  description?: string;
  resolution_source?: string;
  start_date?: string;
  end_date?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted: boolean;
  neg_risk: boolean;
  neg_risk_market_id?: string;
  deployment_status: "PENDING" | "DEPLOYING" | "DEPLOYED";
  comment_count?: number;
  metadata_type?: string;
  metadata?: Record<string, any>;
};

type AdaptedMarket = {
  question: string;
  slug?: string;
  description?: string;
  resolution_source?: string;
  start_date?: string;
  end_date?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  restricted: boolean;
  neg_risk: boolean;
  neg_risk_market_id?: string;
  neg_risk_request_id?: string;
  neg_risk_other: boolean;
  accepting_orders: boolean;
  accepting_orders_timestamp?: string;
  funded: boolean;
  approved: boolean;
  activation: "AUTO" | "MANUAL";
  automatically_active: boolean;
  clear_book_on_start: boolean;
  rfq_enabled: boolean;
  order_price_min_tick_size?: number;
  order_min_size?: number;
  uma_bond?: string;
  uma_reward?: string;
  uma_resolution_status?: string;
  liveness?: string;
  metadata_type?: string;
  metadata?: Record<string, any>;
};

type AdaptedTag = {
  slug: string;
  label: string;
};

type AdaptResult = {
  series: AdaptedSeries | null;
  event: AdaptedEvent;
  markets: AdaptedMarket[];
  tags: AdaptedTag[];
};

// Convert ISO 8601 to the value expected by <input type="datetime-local">
// (no timezone, no seconds). Returns "" on invalid input.
function isoToLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyMarket(): AdaptedMarket {
  return {
    question: "",
    active: true,
    closed: false,
    archived: false,
    restricted: false,
    neg_risk: false,
    neg_risk_other: false,
    accepting_orders: true,
    funded: false,
    approved: false,
    activation: "AUTO",
    automatically_active: false,
    clear_book_on_start: false,
    rfq_enabled: false,
  };
}

type StepStatus = "idle" | "running" | "ok" | "skipped" | "failed";
type StepResult = {
  status: StepStatus;
  message?: string;
  data?: any;
};

function StepBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; cls: string }> = {
    idle: { label: "Idle", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
    running: { label: "Running…", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
    ok: { label: "OK", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    skipped: { label: "Skipped", cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
    failed: { label: "Failed", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };
  const cfg = map[status];
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

function CreateFromSlugTab({ gammaUrl, dpmUrl }: { gammaUrl: string; dpmUrl: string }) {
  const [slug, setSlug] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [series, setSeries] = useState<AdaptedSeries | null>(null);
  const [includeSeries, setIncludeSeries] = useState(false);
  const [event, setEvent] = useState<AdaptedEvent | null>(null);
  const [markets, setMarkets] = useState<AdaptedMarket[]>([]);
  const [tags, setTags] = useState<AdaptedTag[]>([]);
  const [metadataDrafts, setMetadataDrafts] = useState<{
    series: string;
    event: string;
    markets: string[];
  }>({ series: "", event: "", markets: [] });

  const [submitting, setSubmitting] = useState(false);
  const [steps, setSteps] = useState<{
    series: StepResult;
    event: StepResult;
    markets: StepResult[];
    tags: StepResult[];
  }>({ series: { status: "idle" }, event: { status: "idle" }, markets: [], tags: [] });

  async function handleAdapt() {
    if (!slug.trim()) return;
    setFetching(true);
    setFetchError(null);
    setSeries(null);
    setEvent(null);
    setMarkets([]);
    setTags([]);
    setSteps({ series: { status: "idle" }, event: { status: "idle" }, markets: [], tags: [] });

    try {
      const res = await fetch("/api/admin/adapt-polymarket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(body?.error || `HTTP ${res.status}`);
        setFetching(false);
        return;
      }
      const adapted = body.data as AdaptResult;
      setSeries(adapted.series ?? null);
      setIncludeSeries(!!adapted.series);
      setEvent(adapted.event);
      setMarkets(adapted.markets || []);
      // Dedupe by slug just in case the model emitted duplicates.
      const dedupedTags: AdaptedTag[] = [];
      const seenSlugs = new Set<string>();
      for (const t of adapted.tags || []) {
        if (!t.slug || seenSlugs.has(t.slug)) continue;
        seenSlugs.add(t.slug);
        dedupedTags.push({ slug: t.slug, label: t.label || t.slug });
      }
      setTags(dedupedTags);
      setMetadataDrafts({
        series: adapted.series?.metadata ? JSON.stringify(adapted.series.metadata, null, 2) : "",
        event: adapted.event.metadata ? JSON.stringify(adapted.event.metadata, null, 2) : "",
        markets: (adapted.markets || []).map((m) =>
          m.metadata ? JSON.stringify(m.metadata, null, 2) : ""
        ),
      });
      setSteps({
        series: { status: "idle" },
        event: { status: "idle" },
        markets: (adapted.markets || []).map(() => ({ status: "idle" })),
        tags: dedupedTags.map(() => ({ status: "idle" })),
      });
    } catch (e: any) {
      setFetchError(e?.message || "Failed to fetch & adapt");
    } finally {
      setFetching(false);
    }
  }

  function updateSeries(patch: Partial<AdaptedSeries>) {
    setSeries((s) => (s ? { ...s, ...patch } : s));
  }
  function updateEvent(patch: Partial<AdaptedEvent>) {
    setEvent((e) => (e ? { ...e, ...patch } : e));
  }
  function updateMarket(idx: number, patch: Partial<AdaptedMarket>) {
    setMarkets((arr) => arr.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  function addMarket() {
    setMarkets((arr) => [...arr, emptyMarket()]);
    setMetadataDrafts((d) => ({ ...d, markets: [...d.markets, ""] }));
    setSteps((s) => ({ ...s, markets: [...s.markets, { status: "idle" }] }));
  }
  function removeMarket(idx: number) {
    setMarkets((arr) => arr.filter((_, i) => i !== idx));
    setMetadataDrafts((d) => ({ ...d, markets: d.markets.filter((_, i) => i !== idx) }));
    setSteps((s) => ({ ...s, markets: s.markets.filter((_, i) => i !== idx) }));
  }
  function updateTag(idx: number, patch: Partial<AdaptedTag>) {
    setTags((arr) => arr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function addTag() {
    setTags((arr) => [...arr, { slug: "", label: "" }]);
    setSteps((s) => ({ ...s, tags: [...s.tags, { status: "idle" }] }));
  }
  function removeTag(idx: number) {
    setTags((arr) => arr.filter((_, i) => i !== idx));
    setSteps((s) => ({ ...s, tags: s.tags.filter((_, i) => i !== idx) }));
  }

  function buildSeriesPayload(): Parameters<typeof createSeries>[1] | null {
    if (!series) return null;
    const out: Parameters<typeof createSeries>[1] = {
      slug: series.slug,
      title: series.title,
      active: series.active,
      closed: series.closed,
      archived: series.archived,
      restricted: series.restricted,
      featured: series.featured,
      new: series.new,
      requires_translation: series.requires_translation,
    };
    if (series.ticker) out.ticker = series.ticker;
    if (series.description) out.description = series.description;
    if (series.icon) out.icon = series.icon;
    if (series.series_type) out.series_type = series.series_type;
    if (series.recurrence) out.recurrence = series.recurrence;
    if (typeof series.comment_count === "number") out.comment_count = series.comment_count;
    if (series.metadata_type) out.metadata_type = series.metadata_type;
    if (metadataDrafts.series.trim()) {
      out.metadata = JSON.parse(metadataDrafts.series);
    }
    return out;
  }

  function buildEventPayload(seriesExternalId: string | undefined, tagIds: number[]): Record<string, any> {
    if (!event) throw new Error("event is null");
    const out: Record<string, any> = {
      slug: event.slug,
      title: event.title,
      active: event.active,
      closed: event.closed,
      archived: event.archived,
      restricted: event.restricted,
      neg_risk: event.neg_risk,
      deployment_status: event.deployment_status,
    };
    if (event.ticker) out.ticker = event.ticker;
    if (event.description) out.description = event.description;
    if (event.resolution_source) out.resolution_source = event.resolution_source;
    if (event.start_date) out.start_date = new Date(event.start_date).toISOString();
    if (event.end_date) out.end_date = new Date(event.end_date).toISOString();
    if (event.icon) out.icon = event.icon;
    if (event.neg_risk_market_id) out.neg_risk_market_id = event.neg_risk_market_id;
    if (typeof event.comment_count === "number") out.comment_count = event.comment_count;
    if (event.metadata_type) out.metadata_type = event.metadata_type;
    if (metadataDrafts.event.trim()) out.metadata = JSON.parse(metadataDrafts.event);
    if (seriesExternalId) out.series_external_id = seriesExternalId;
    if (tagIds.length > 0) out.tag_ids = tagIds;
    return out;
  }

  function buildMarketPayload(m: AdaptedMarket, idx: number, eventExternalId: string): Record<string, any> {
    const out: Record<string, any> = {
      event_external_id: eventExternalId,
      question: m.question,
      active: m.active,
      closed: m.closed,
      archived: m.archived,
      restricted: m.restricted,
      neg_risk: m.neg_risk,
      neg_risk_other: m.neg_risk_other,
      accepting_orders: m.accepting_orders,
      funded: m.funded,
      approved: m.approved,
      activation: m.activation,
      automatically_active: m.automatically_active,
      clear_book_on_start: m.clear_book_on_start,
      rfq_enabled: m.rfq_enabled,
    };
    if (m.slug) out.slug = m.slug;
    if (m.description) out.description = m.description;
    if (m.resolution_source) out.resolution_source = m.resolution_source;
    if (m.start_date) out.start_date = new Date(m.start_date).toISOString();
    if (m.end_date) out.end_date = new Date(m.end_date).toISOString();
    if (m.accepting_orders_timestamp) out.accepting_orders_timestamp = new Date(m.accepting_orders_timestamp).toISOString();
    if (m.neg_risk_market_id) out.neg_risk_market_id = m.neg_risk_market_id;
    if (m.neg_risk_request_id) out.neg_risk_request_id = m.neg_risk_request_id;
    if (typeof m.order_price_min_tick_size === "number") out.order_price_min_tick_size = m.order_price_min_tick_size;
    if (typeof m.order_min_size === "number") out.order_min_size = m.order_min_size;
    if (m.uma_bond) out.uma_bond = m.uma_bond;
    if (m.uma_reward) out.uma_reward = m.uma_reward;
    if (m.uma_resolution_status) out.uma_resolution_status = m.uma_resolution_status;
    if (m.liveness) out.liveness = m.liveness;
    if (m.metadata_type) out.metadata_type = m.metadata_type;
    const draft = metadataDrafts.markets[idx];
    if (draft && draft.trim()) out.metadata = JSON.parse(draft);
    return out;
  }

  async function handleCreateAll() {
    if (!event) return;
    setSubmitting(true);

    // Validate metadata JSON drafts up-front
    if (includeSeries && metadataDrafts.series.trim() && !isMetadataValid(metadataDrafts.series)) {
      setSteps((s) => ({ ...s, series: { status: "failed", message: "Series metadata JSON invalid" } }));
      setSubmitting(false);
      return;
    }
    if (metadataDrafts.event.trim() && !isMetadataValid(metadataDrafts.event)) {
      setSteps((s) => ({ ...s, event: { status: "failed", message: "Event metadata JSON invalid" } }));
      setSubmitting(false);
      return;
    }
    for (let i = 0; i < markets.length; i++) {
      const d = metadataDrafts.markets[i] || "";
      if (d.trim() && !isMetadataValid(d)) {
        setSteps((s) => {
          const next = [...s.markets];
          next[i] = { status: "failed", message: `Market #${i + 1} metadata JSON invalid` };
          return { ...s, markets: next };
        });
        setSubmitting(false);
        return;
      }
    }

    // 1. Series (optional)
    let seriesExternalId: string | undefined;
    if (includeSeries && series) {
      setSteps((s) => ({ ...s, series: { status: "running" } }));
      const payload = buildSeriesPayload();
      if (!payload) {
        setSteps((s) => ({ ...s, series: { status: "failed", message: "series payload missing" } }));
        setSubmitting(false);
        return;
      }
      const res = await createSeries(dpmUrl, payload);
      if (!res.success) {
        setSteps((s) => ({ ...s, series: { status: "failed", message: res.error } }));
        setSubmitting(false);
        return;
      }
      seriesExternalId = res.data?.external_id || res.data?.id;
      setSteps((s) => ({
        ...s,
        series: { status: "ok", message: `external_id: ${seriesExternalId || "(unknown)"}`, data: res.data },
      }));
    } else {
      setSteps((s) => ({ ...s, series: { status: "skipped" } }));
    }

    // 2. Tags (upsert by slug)
    const resolvedTagIds: number[] = [];
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (!tag.slug.trim()) {
        setSteps((s) => {
          const next = [...s.tags];
          next[i] = { status: "failed", message: "slug is empty" };
          return { ...s, tags: next };
        });
        setSubmitting(false);
        return;
      }
      setSteps((s) => {
        const next = [...s.tags];
        next[i] = { status: "running" };
        return { ...s, tags: next };
      });

      // Exact-slug match against gamma. listTags search is fuzzy, so we filter
      // the page client-side for an exact slug hit before deciding to create.
      const lookup = await listTags(gammaUrl, { search: tag.slug, limit: "20" });
      if (!lookup.success) {
        setSteps((s) => {
          const next = [...s.tags];
          next[i] = { status: "failed", message: `lookup failed: ${lookup.error}` };
          return { ...s, tags: next };
        });
        setSubmitting(false);
        return;
      }
      const existing = (lookup.data?.data ?? []).find(
        (t: any) => t.slug === tag.slug && typeof t.id === "number"
      );
      if (existing) {
        resolvedTagIds.push(existing.id);
        setSteps((s) => {
          const next = [...s.tags];
          next[i] = { status: "ok", message: `existing id ${existing.id}` };
          return { ...s, tags: next };
        });
        continue;
      }

      const created = await createTag(dpmUrl, {
        slug: tag.slug,
        label: tag.label || tag.slug,
      });
      if (!created.success) {
        setSteps((s) => {
          const next = [...s.tags];
          next[i] = { status: "failed", message: `create failed: ${created.error}` };
          return { ...s, tags: next };
        });
        setSubmitting(false);
        return;
      }
      const newId =
        typeof created.data?.id === "number"
          ? created.data.id
          : typeof created.data?.int_id === "number"
          ? created.data.int_id
          : typeof created.data?.intId === "number"
          ? created.data.intId
          : null;
      if (newId === null) {
        setSteps((s) => {
          const next = [...s.tags];
          next[i] = {
            status: "failed",
            message: "created but response missing integer id",
            data: created.data,
          };
          return { ...s, tags: next };
        });
        setSubmitting(false);
        return;
      }
      resolvedTagIds.push(newId);
      setSteps((s) => {
        const next = [...s.tags];
        next[i] = { status: "ok", message: `created id ${newId}` };
        return { ...s, tags: next };
      });
    }

    // 3. Event
    setSteps((s) => ({ ...s, event: { status: "running" } }));
    const eventPayload = buildEventPayload(seriesExternalId, resolvedTagIds);
    const eventRes = await createEvent(dpmUrl, eventPayload);
    if (!eventRes.success) {
      setSteps((s) => ({ ...s, event: { status: "failed", message: eventRes.error } }));
      setSubmitting(false);
      return;
    }
    const eventExternalId = eventRes.data?.external_id || eventRes.data?.id;
    if (!eventExternalId) {
      setSteps((s) => ({
        ...s,
        event: { status: "failed", message: "event created but response missing external_id", data: eventRes.data },
      }));
      setSubmitting(false);
      return;
    }
    setSteps((s) => ({
      ...s,
      event: { status: "ok", message: `external_id: ${eventExternalId}`, data: eventRes.data },
    }));

    // 4. Markets
    for (let i = 0; i < markets.length; i++) {
      setSteps((s) => {
        const next = [...s.markets];
        next[i] = { status: "running" };
        return { ...s, markets: next };
      });
      const payload = buildMarketPayload(markets[i], i, eventExternalId);
      const res = await createMarket(dpmUrl, payload);
      setSteps((s) => {
        const next = [...s.markets];
        next[i] = res.success
          ? { status: "ok", data: res.data, message: "queued for deployment" }
          : { status: "failed", message: res.error };
        return { ...s, markets: next };
      });
      if (!res.success) {
        // Continue to next market — partial failures are reported per-row,
        // user can retry individual markets via the Events tab.
      }
    }

    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      <Card title="Create from Polymarket Slug">
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Paste a Polymarket slug (e.g. <span className="font-mono">starmer-out-in-2025</span>).
            We fetch the gamma payload and use Gemini to map it to our Series/Event/Market shape.
            Review &amp; edit below, then submit.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="polymarket-event-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.trim())}
              className="h-9 font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && slug && !fetching) handleAdapt();
              }}
            />
            <Button onClick={handleAdapt} disabled={!slug || fetching}>
              {fetching ? "Fetching…" : "Fetch & Adapt"}
            </Button>
          </div>
          {fetchError && <ErrorBox error={fetchError} />}
          <p className="text-[10px] text-zinc-400">
            Gamma source: <span className="font-mono">https://gamma-api.polymarket.com/events/slug/&lt;slug&gt;</span>
            {" · "}
            Writes go to DPM API at <span className="font-mono">{dpmUrl}</span>
            {" · "}
            Read URL: <span className="font-mono">{gammaUrl}</span>
          </p>
        </div>
      </Card>

      {event && (
        <>
          {/* Series */}
          <Card
            title="Series (optional)"
            actions={
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeSeries}
                  onChange={(e) => setIncludeSeries(e.target.checked)}
                />
                Include series in this submission
              </label>
            }
          >
            {includeSeries ? (
              <SeriesEditor
                value={
                  series ?? {
                    slug: "",
                    title: "",
                    active: true,
                    closed: false,
                    archived: false,
                    restricted: false,
                    featured: false,
                    new: false,
                    requires_translation: false,
                  }
                }
                metadataDraft={metadataDrafts.series}
                onMetadataDraftChange={(v) => setMetadataDrafts((d) => ({ ...d, series: v }))}
                onChange={(patch) => {
                  if (!series) {
                    setSeries({
                      slug: "",
                      title: "",
                      active: true,
                      closed: false,
                      archived: false,
                      restricted: false,
                      featured: false,
                      new: false,
                      requires_translation: false,
                      ...patch,
                    });
                  } else {
                    updateSeries(patch);
                  }
                }}
              />
            ) : (
              <p className="text-xs text-zinc-500">
                No series will be created. Toggle the checkbox above if this Polymarket payload
                belongs to a parent series.
              </p>
            )}
          </Card>

          {/* Event */}
          <Card title="Event">
            <EventEditor
              value={event}
              metadataDraft={metadataDrafts.event}
              onMetadataDraftChange={(v) => setMetadataDrafts((d) => ({ ...d, event: v }))}
              onChange={updateEvent}
            />
          </Card>

          {/* Tags */}
          <Card
            title={`Tags (${tags.length})`}
            actions={
              <Button variant="outline" size="sm" onClick={addTag}>
                + Add Tag
              </Button>
            }
          >
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-500">
                Each tag is upserted by slug: if a tag with the same slug already exists in gamma,
                it&apos;s reused; otherwise it&apos;s created. Resolved tag ids are attached to the
                event via <span className="font-mono">tag_ids</span>.
              </p>
              {tags.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-400">
                  No tags. Click &quot;+ Add Tag&quot; to attach one.
                </p>
              ) : (
                tags.map((t, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs font-medium">
                        Slug <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={t.slug}
                        onChange={(e) => updateTag(i, { slug: e.target.value.trim() })}
                        placeholder="politics"
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-medium">Label</Label>
                      <Input
                        value={t.label}
                        onChange={(e) => updateTag(i, { label: e.target.value })}
                        placeholder="Politics"
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeTag(i)}
                      className="h-8 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Markets */}
          <Card
            title={`Markets (${markets.length})`}
            actions={
              <Button variant="outline" size="sm" onClick={addMarket}>
                + Add Market
              </Button>
            }
          >
            <div className="space-y-4">
              {markets.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">
                  No markets. Click &quot;+ Add Market&quot; to add one.
                </p>
              ) : (
                markets.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Market #{i + 1}</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeMarket(i)}
                        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        Remove
                      </Button>
                    </div>
                    <MarketEditor
                      value={m}
                      metadataDraft={metadataDrafts.markets[i] || ""}
                      onMetadataDraftChange={(v) =>
                        setMetadataDrafts((d) => {
                          const next = [...d.markets];
                          next[i] = v;
                          return { ...d, markets: next };
                        })
                      }
                      onChange={(patch) => updateMarket(i, patch)}
                    />
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Submit */}
          <Card title="Submit">
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                The submit runs sequentially: {includeSeries ? "Series → " : ""}Event → Markets
                (one by one). Failures on later steps do not roll back earlier ones — use the
                Events tab to fix or retry individual rows.
              </p>
              <Button
                onClick={handleCreateAll}
                disabled={submitting || !event.slug || !event.title}
                className="w-full"
              >
                {submitting ? "Creating…" : "Create All"}
              </Button>

              {(steps.series.status !== "idle" ||
                steps.event.status !== "idle" ||
                steps.markets.some((s) => s.status !== "idle") ||
                steps.tags.some((s) => s.status !== "idle")) && (
                <div className="space-y-2 rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span>Series</span>
                    <div className="flex items-center gap-2">
                      {steps.series.message && (
                        <span className="font-mono text-[10px] text-zinc-500">
                          {steps.series.message}
                        </span>
                      )}
                      <StepBadge status={steps.series.status} />
                    </div>
                  </div>
                  {steps.tags.map((s, i) => (
                    <div key={`tag-${i}`} className="flex items-center justify-between">
                      <span>
                        Tag #{i + 1} <span className="font-mono text-zinc-400">{tags[i]?.slug}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {s.message && (
                          <span className="font-mono text-[10px] text-zinc-500">{s.message}</span>
                        )}
                        <StepBadge status={s.status} />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <span>Event</span>
                    <div className="flex items-center gap-2">
                      {steps.event.message && (
                        <span className="font-mono text-[10px] text-zinc-500">
                          {steps.event.message}
                        </span>
                      )}
                      <StepBadge status={steps.event.status} />
                    </div>
                  </div>
                  {steps.markets.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span>Market #{i + 1}</span>
                      <div className="flex items-center gap-2">
                        {s.message && (
                          <span className="font-mono text-[10px] text-zinc-500">{s.message}</span>
                        )}
                        <StepBadge status={s.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// --- Editors -----------------------------------------------------------------

function BoolSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <Label className="text-xs font-medium">{label}</Label>
      <select
        value={value ? "true" : "false"}
        onChange={(e) => onChange(e.target.value === "true")}
        className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  );
}

function SeriesEditor({
  value,
  metadataDraft,
  onMetadataDraftChange,
  onChange,
}: {
  value: AdaptedSeries;
  metadataDraft: string;
  onMetadataDraftChange: (v: string) => void;
  onChange: (patch: Partial<AdaptedSeries>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Slug <span className="text-red-500">*</span></Label>
          <Input value={value.slug} onChange={(e) => onChange({ slug: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Title <span className="text-red-500">*</span></Label>
          <Input value={value.title} onChange={(e) => onChange({ title: e.target.value })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Ticker</Label>
          <Input value={value.ticker || ""} onChange={(e) => onChange({ ticker: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <textarea
          value={value.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Icon URL</Label>
          <Input value={value.icon || ""} onChange={(e) => onChange({ icon: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Series Type</Label>
          <Input value={value.series_type || ""} onChange={(e) => onChange({ series_type: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Recurrence</Label>
          <Input value={value.recurrence || ""} onChange={(e) => onChange({ recurrence: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        <BoolSelect label="Active" value={value.active} onChange={(v) => onChange({ active: v })} />
        <BoolSelect label="Closed" value={value.closed} onChange={(v) => onChange({ closed: v })} />
        <BoolSelect label="Archived" value={value.archived} onChange={(v) => onChange({ archived: v })} />
        <BoolSelect label="Restricted" value={value.restricted} onChange={(v) => onChange({ restricted: v })} />
        <BoolSelect label="Featured" value={value.featured} onChange={(v) => onChange({ featured: v })} />
        <BoolSelect label="New" value={value.new} onChange={(v) => onChange({ new: v })} />
        <BoolSelect label="i18n" value={value.requires_translation} onChange={(v) => onChange({ requires_translation: v })} />
      </div>
      <div>
        <Label className="text-xs font-medium">Metadata Type</Label>
        <Input value={value.metadata_type || ""} onChange={(e) => onChange({ metadata_type: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
      </div>
      <div>
        <Label className="text-xs font-medium">Metadata (JSON)</Label>
        <textarea
          value={metadataDraft}
          onChange={(e) => onMetadataDraftChange(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
        />
        <MetadataHint value={metadataDraft} />
      </div>
    </div>
  );
}

function EventEditor({
  value,
  metadataDraft,
  onMetadataDraftChange,
  onChange,
}: {
  value: AdaptedEvent;
  metadataDraft: string;
  onMetadataDraftChange: (v: string) => void;
  onChange: (patch: Partial<AdaptedEvent>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Slug <span className="text-red-500">*</span></Label>
          <Input value={value.slug} onChange={(e) => onChange({ slug: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Ticker</Label>
          <Input value={value.ticker || ""} onChange={(e) => onChange({ ticker: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Title <span className="text-red-500">*</span></Label>
        <Input value={value.title} onChange={(e) => onChange({ title: e.target.value })} className="mt-1 h-8 text-xs" />
      </div>
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <textarea
          value={value.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Resolution Source</Label>
          <Input value={value.resolution_source || ""} onChange={(e) => onChange({ resolution_source: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Icon URL</Label>
          <Input value={value.icon || ""} onChange={(e) => onChange({ icon: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Start Date</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(value.start_date)}
            onChange={(e) => onChange({ start_date: e.target.value })}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">End Date</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(value.end_date)}
            onChange={(e) => onChange({ end_date: e.target.value })}
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <BoolSelect label="Active" value={value.active} onChange={(v) => onChange({ active: v })} />
        <BoolSelect label="Closed" value={value.closed} onChange={(v) => onChange({ closed: v })} />
        <BoolSelect label="Archived" value={value.archived} onChange={(v) => onChange({ archived: v })} />
        <BoolSelect label="Restricted" value={value.restricted} onChange={(v) => onChange({ restricted: v })} />
        <BoolSelect label="Neg Risk" value={value.neg_risk} onChange={(v) => onChange({ neg_risk: v })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Deployment Status</Label>
          <select
            value={value.deployment_status}
            onChange={(e) => onChange({ deployment_status: e.target.value as AdaptedEvent["deployment_status"] })}
            className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="PENDING">PENDING</option>
            <option value="DEPLOYING">DEPLOYING</option>
            <option value="DEPLOYED">DEPLOYED</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium">Neg Risk Market ID</Label>
          <Input value={value.neg_risk_market_id || ""} onChange={(e) => onChange({ neg_risk_market_id: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Metadata Type</Label>
          <Input value={value.metadata_type || ""} onChange={(e) => onChange({ metadata_type: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Metadata (JSON)</Label>
        <textarea
          value={metadataDraft}
          onChange={(e) => onMetadataDraftChange(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
        />
        <MetadataHint value={metadataDraft} />
      </div>
    </div>
  );
}

function MarketEditor({
  value,
  metadataDraft,
  onMetadataDraftChange,
  onChange,
}: {
  value: AdaptedMarket;
  metadataDraft: string;
  onMetadataDraftChange: (v: string) => void;
  onChange: (patch: Partial<AdaptedMarket>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Question <span className="text-red-500">*</span></Label>
        <Input value={value.question} onChange={(e) => onChange({ question: e.target.value })} className="mt-1 h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Slug</Label>
          <Input value={value.slug || ""} onChange={(e) => onChange({ slug: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Resolution Source</Label>
          <Input value={value.resolution_source || ""} onChange={(e) => onChange({ resolution_source: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Description</Label>
        <textarea
          value={value.description || ""}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium">Start Date</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(value.start_date)}
            onChange={(e) => onChange({ start_date: e.target.value })}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">End Date</Label>
          <Input
            type="datetime-local"
            value={isoToLocalInput(value.end_date)}
            onChange={(e) => onChange({ end_date: e.target.value })}
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <BoolSelect label="Active" value={value.active} onChange={(v) => onChange({ active: v })} />
        <BoolSelect label="Closed" value={value.closed} onChange={(v) => onChange({ closed: v })} />
        <BoolSelect label="Archived" value={value.archived} onChange={(v) => onChange({ archived: v })} />
        <BoolSelect label="Restricted" value={value.restricted} onChange={(v) => onChange({ restricted: v })} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <BoolSelect label="Accepting Orders" value={value.accepting_orders} onChange={(v) => onChange({ accepting_orders: v })} />
        <BoolSelect label="Funded" value={value.funded} onChange={(v) => onChange({ funded: v })} />
        <BoolSelect label="Approved" value={value.approved} onChange={(v) => onChange({ approved: v })} />
        <BoolSelect label="RFQ Enabled" value={value.rfq_enabled} onChange={(v) => onChange({ rfq_enabled: v })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Activation</Label>
          <select
            value={value.activation}
            onChange={(e) => onChange({ activation: e.target.value as AdaptedMarket["activation"] })}
            className="mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="AUTO">AUTO</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </div>
        <BoolSelect label="Auto Active" value={value.automatically_active} onChange={(v) => onChange({ automatically_active: v })} />
        <BoolSelect label="Clear Book on Start" value={value.clear_book_on_start} onChange={(v) => onChange({ clear_book_on_start: v })} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <BoolSelect label="Neg Risk" value={value.neg_risk} onChange={(v) => onChange({ neg_risk: v })} />
        <div>
          <Label className="text-xs font-medium">Neg Risk Market ID</Label>
          <Input value={value.neg_risk_market_id || ""} onChange={(e) => onChange({ neg_risk_market_id: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Neg Risk Request ID</Label>
          <Input value={value.neg_risk_request_id || ""} onChange={(e) => onChange({ neg_risk_request_id: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
        <BoolSelect label="Neg Risk Other" value={value.neg_risk_other} onChange={(v) => onChange({ neg_risk_other: v })} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <Label className="text-xs font-medium">Min Tick Size</Label>
          <Input
            value={value.order_price_min_tick_size?.toString() ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange({ order_price_min_tick_size: v === "" ? undefined : parseFloat(v) });
            }}
            className="mt-1 h-8 font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">Min Order Size</Label>
          <Input
            value={value.order_min_size?.toString() ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange({ order_min_size: v === "" ? undefined : parseInt(v, 10) });
            }}
            className="mt-1 h-8 font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-medium">UMA Bond</Label>
          <Input value={value.uma_bond || ""} onChange={(e) => onChange({ uma_bond: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">UMA Reward</Label>
          <Input value={value.uma_reward || ""} onChange={(e) => onChange({ uma_reward: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium">Liveness (s)</Label>
          <Input value={value.liveness || ""} onChange={(e) => onChange({ liveness: e.target.value.trim() })} className="mt-1 h-8 font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">UMA Resolution Status</Label>
          <Input value={value.uma_resolution_status || ""} onChange={(e) => onChange({ uma_resolution_status: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs font-medium">Metadata Type</Label>
          <Input value={value.metadata_type || ""} onChange={(e) => onChange({ metadata_type: e.target.value.trim() })} className="mt-1 h-8 text-xs" />
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Metadata (JSON)</Label>
        <textarea
          value={metadataDraft}
          onChange={(e) => onMetadataDraftChange(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
        />
        <MetadataHint value={metadataDraft} />
      </div>
    </div>
  );
}

function SeriesTab({ gammaUrl, dpmUrl }: { gammaUrl: string; dpmUrl: string }) {
  const [series, setSeries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    ticker: "",
    description: "",
    icon: "",
    series_type: "",
    recurrence: "",
    active: "true",
    closed: "false",
    archived: "false",
    restricted: "false",
    featured: "false",
    new: "false",
    requires_translation: "false",
    comment_count: "",
    metadata_type: "",
    metadata: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  function setField(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listSeries(gammaUrl, {
      limit: String(limit),
      offset: String(page * limit),
      search,
    });
    if (res.success) {
      setSeries(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [gammaUrl, page, search]);

  useEffect(() => {
    const t = setTimeout(() => fetchSeries(), 200);
    return () => clearTimeout(t);
  }, [fetchSeries]);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    const payload: Parameters<typeof createSeries>[1] = {
      slug: form.slug,
      title: form.title,
      active: form.active === "true",
      closed: form.closed === "true",
      archived: form.archived === "true",
      restricted: form.restricted === "true",
      featured: form.featured === "true",
      new: form.new === "true",
      requires_translation: form.requires_translation === "true",
    };
    if (form.ticker) payload.ticker = form.ticker;
    if (form.description) payload.description = form.description;
    if (form.icon) payload.icon = form.icon;
    if (form.series_type) payload.series_type = form.series_type;
    if (form.recurrence) payload.recurrence = form.recurrence;
    if (form.comment_count) payload.comment_count = parseInt(form.comment_count, 10);
    if (form.metadata_type) payload.metadata_type = form.metadata_type;
    if (form.metadata.trim()) {
      try {
        payload.metadata = JSON.parse(form.metadata);
      } catch (e: any) {
        setCreateError(`Invalid metadata JSON: ${e.message}`);
        setCreating(false);
        return;
      }
    }

    const res = await createSeries(dpmUrl, payload);
    if (res.success) {
      setCreateSuccess(`Created series "${res.data?.title || form.title}"`);
      setForm({
        slug: "", title: "", ticker: "", description: "", icon: "",
        series_type: "", recurrence: "", active: "true", closed: "false",
        archived: "false", restricted: "false", featured: "false", new: "false",
        requires_translation: "false", comment_count: "", metadata_type: "", metadata: "",
      });
      await fetchSeries();
    } else {
      setCreateError(res.error);
    }
    setCreating(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canCreate =
    form.slug.trim() && form.title.trim() && !creating && isMetadataValid(form.metadata);

  return (
    <div className="space-y-4">
      <Card
        title="Create Series"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Hide" : "Show"}
          </Button>
        }
      >
        {showCreate ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Slug <span className="text-red-500">*</span></Label>
                <Input placeholder="series-slug" value={form.slug} onChange={(e) => setField("slug", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Title <span className="text-red-500">*</span></Label>
                <Input placeholder="Series title" value={form.title} onChange={(e) => setField("title", e.target.value)} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Ticker</Label>
                <Input placeholder="SERIES-TICKER" value={form.ticker} onChange={(e) => setField("ticker", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Description</Label>
              <textarea placeholder="Series description" value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium">Icon URL</Label>
                <Input placeholder="https://..." value={form.icon} onChange={(e) => setField("icon", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Series Type</Label>
                <Input placeholder="e.g. tournament" value={form.series_type} onChange={(e) => setField("series_type", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Recurrence</Label>
                <Input placeholder="e.g. weekly" value={form.recurrence} onChange={(e) => setField("recurrence", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {([
                ["active", "Active"],
                ["closed", "Closed"],
                ["archived", "Archived"],
                ["restricted", "Restricted"],
                ["featured", "Featured"],
                ["new", "New"],
                ["requires_translation", "i18n"],
              ] as const).map(([key, label]) => (
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
                <Label className="text-xs font-medium">Comment Count</Label>
                <Input placeholder="optional int" value={form.comment_count} onChange={(e) => setField("comment_count", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs font-medium">Metadata Type</Label>
                <Input placeholder="free-form classifier" value={form.metadata_type} onChange={(e) => setField("metadata_type", e.target.value.trim())} className="mt-1 h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Metadata (JSON)</Label>
              <textarea
                placeholder='{"key": "value"}'
                value={form.metadata}
                onChange={(e) => setField("metadata", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <MetadataHint value={form.metadata} />
            </div>

            <Button onClick={handleCreate} disabled={!canCreate} className="w-full">
              {creating ? "Creating..." : "Create Series"}
            </Button>

            {createError && <ErrorBox error={createError} />}
            {createSuccess && (
              <SuccessBox>
                <p className="text-sm text-green-800 dark:text-green-200">{createSuccess}</p>
              </SuccessBox>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Click &quot;Show&quot; to add a new series.</p>
        )}
      </Card>

      <Card
        title={`Series${total > 0 ? ` (${total})` : ""}`}
        actions={
          <Button variant="outline" size="sm" onClick={fetchSeries} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="Search by title or slug..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 text-xs"
          />

          {error && <ErrorBox error={error} />}

          {loading && series.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading...</p>
          ) : series.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              {search ? "No matching series" : "No series yet"}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-500">Title</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Slug</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Series Type</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Recurrence</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Metadata Type</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">Flags</th>
                    <th className="px-3 py-2 font-medium text-zinc-500">External ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {series.map((s: any) => (
                    <tr key={s.external_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-3 py-2 font-medium">{s.title}</td>
                      <td className="px-3 py-2 font-mono">{s.slug}</td>
                      <td className="px-3 py-2 text-zinc-500">{s.series_type || "-"}</td>
                      <td className="px-3 py-2 text-zinc-500">{s.recurrence || "-"}</td>
                      <td className="px-3 py-2 text-zinc-500">{s.metadata_type || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <BoolBadge value={!!s.active} label="active" />
                          <BoolBadge value={!!s.closed} label="closed" />
                          <BoolBadge value={!!s.archived} label="archived" />
                          <BoolBadge value={!!s.featured} label="featured" />
                          <BoolBadge value={!!s.new} label="new" />
                        </div>
                      </td>
                      <td className="px-3 py-2 truncate font-mono text-[10px] text-zinc-500">
                        {s.external_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages || loading}>
                  Next
                </Button>
              </div>
            </div>
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
  const [gammaUrl, setGammaUrl] = usePersistedState("admin_gamma_url", process.env.NEXT_PUBLIC_GAMMA_API_BASE_URL || DEFAULT_GAMMA_URL);
  const [dpmUrl, setDpmUrl] = usePersistedState("admin_dpm_url", process.env.NEXT_PUBLIC_DPM_API_BASE_URL || DEFAULT_DPM_URL);
  const [showConfig, setShowConfig] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: "events", label: "Events" },
    { key: "create-from-slug", label: "Create from Slug" },
    { key: "relayer-wallets", label: "Relayer Wallets" },
    { key: "builders", label: "Builders" },
    { key: "smart-account", label: "Smart Account" },
    { key: "collateral", label: "Collateral Balance" },
    { key: "balances", label: "Balances" },
    { key: "contracts", label: "Contracts" },
    { key: "tags", label: "Tags" },
    { key: "series", label: "Series" },
    { key: "treasury", label: "Treasury" },
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
          <div className={activeTab === "create-from-slug" ? "" : "hidden"}><CreateFromSlugTab gammaUrl={gammaUrl} dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "relayer-wallets" ? "" : "hidden"}><RelayerWalletsTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "builders" ? "" : "hidden"}><BuildersTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "smart-account" ? "" : "hidden"}><SmartAccountTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "collateral" ? "" : "hidden"}><CollateralBalanceTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "balances" ? "" : "hidden"}><BalancesTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "contracts" ? "" : "hidden"}><ContractsTab dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "tags" ? "" : "hidden"}><TagsTab gammaUrl={gammaUrl} dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "series" ? "" : "hidden"}><SeriesTab gammaUrl={gammaUrl} dpmUrl={dpmUrl} /></div>
          <div className={activeTab === "treasury" ? "" : "hidden"}><TreasuryTab /></div>
        </div>
      </div>
    </div>
  );
}
