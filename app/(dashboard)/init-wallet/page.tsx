"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deactivateRelayerWallet,
  getMnemonicStatus,
  initRelayerWallet,
  listRelayerWallets,
  type InitRelayerWalletResponse,
  type WalletType,
} from "@/lib/admin/actions";
import { RelayerWalletWithdrawDialog } from "@/components/admin/relayer-wallet-withdraw";

const DEFAULT_DPM_URL = "http://localhost:8086";
const PAGE_SIZE = 10;

const WALLET_TYPES: { value: WalletType; label: string; hint: string }[] = [
  {
    value: "TREASURY_ADMIN",
    label: "Treasury Admin",
    hint: "Granted DEFAULT_ADMIN_ROLE on the Treasury contract.",
  },
  { value: "FEE_ADMIN", label: "Fee Admin", hint: "addAdmin on FeeModule." },
  {
    value: "CTF_ADMIN",
    label: "CTF Exchange Admin",
    hint: "addAdmin on CTFExchange + FeeModule.",
  },
  {
    value: "UMA_ADMIN",
    label: "UMA Admin",
    hint:
      "Funded with 10k USDC + POL; addAdmin on UmaCtfAdapter + addToWhitelist on OracleWhitelist.",
  },
  {
    value: "RELAYER_ADMIN",
    label: "Relayer",
    hint:
      "RelayHub stake → depositFor → registerRelay. Needs RELAY_HUB_* envs.",
  },
  {
    value: "ORACLE_ADMIN",
    label: "Oracle Admin",
    hint: "Fund-only — no grant step defined yet.",
  },
];

const typeColors: Record<string, string> = {
  UMA_ADMIN:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  RELAYER_ADMIN:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CTF_ADMIN:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  FEE_ADMIN: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  TREASURY_ADMIN:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  ORACLE_ADMIN:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const initStatusColors: Record<string, string> = {
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  IN_PROGRESS:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  COMPLETED:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function InitWalletPage() {
  // --- shared config ---
  const [dpmUrl, setDpmUrl] = useState(DEFAULT_DPM_URL);

  // --- mnemonic check ---
  const [mnemonicExists, setMnemonicExists] = useState<boolean | null>(null);

  const refreshMnemonic = useCallback(async () => {
    const res = await getMnemonicStatus(dpmUrl);
    if (res.success) setMnemonicExists(res.data.exists);
    else setMnemonicExists(null);
  }, [dpmUrl]);

  // --- create form ---
  const [type, setType] = useState<WalletType>("TREASURY_ADMIN");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InitRelayerWalletResponse | null>(null);
  const [submitError, setSubmitError] = useState("");

  // --- list state ---
  const [wallets, setWallets] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // --- filters ---
  const [filterAddress, setFilterAddress] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterInitStatus, setFilterInitStatus] = useState("");

  const fetchWallets = useCallback(
    async (pageNum: number) => {
      setListLoading(true);
      setListError("");
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      };
      if (filterAddress) params.address = filterAddress;
      if (filterType) params.wallet_type = filterType;
      if (filterLabel) params.label = filterLabel;

      const res = await listRelayerWallets(dpmUrl, params);
      if (res.success) {
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
    refreshMnemonic();
  }, [refreshMnemonic]);

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

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    setResult(null);
    const res = await initRelayerWallet(dpmUrl, {
      type,
      label: label || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      setResult(res.data);
      refreshMnemonic();
      // Show the new wallet immediately while it's still PENDING.
      fetchWallets(0);
      setPage(0);
    } else {
      setSubmitError(res.error);
    }
  }

  const selected = WALLET_TYPES.find((t) => t.value === type);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Initialize Wallet</h1>
        <p className="text-sm text-zinc-500">
          Derive a fresh wallet from the HD mnemonic and kick off the per-type
          on-chain init workflow (fund POL, grant roles, etc.). Returns 202
          immediately; the table below tracks <code>init_status</code> as the
          workflow runs.
        </p>
      </div>

      {/* Shared config */}
      <div className="mb-6 max-w-xl space-y-2">
        <Label htmlFor="dpm-url">DPM API URL</Label>
        <Input
          id="dpm-url"
          value={dpmUrl}
          onChange={(e) => setDpmUrl(e.target.value)}
        />
        <div className="text-xs text-zinc-500">
          Mnemonic:{" "}
          {mnemonicExists === null ? (
            <span>unknown</span>
          ) : mnemonicExists ? (
            <Badge className="bg-green-500 hover:bg-green-500">exists</Badge>
          ) : (
            <Badge variant="outline">
              missing — create it first on /mnemonic
            </Badge>
          )}
        </div>
      </div>

      {/* --- Init form --- */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Initialize a new wallet</h2>

        <div className="mb-6 max-w-xl space-y-2">
          <Label>Wallet type</Label>
          <div className="grid grid-cols-2 gap-2">
            {WALLET_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-md border p-3 text-left text-sm transition-colors ${
                  type === t.value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                }`}
              >
                <div className="font-medium">{t.label}</div>
                <div
                  className={`mt-0.5 text-xs ${
                    type === t.value
                      ? "text-zinc-300 dark:text-zinc-600"
                      : "text-zinc-500"
                  }`}
                >
                  {t.value}
                </div>
              </button>
            ))}
          </div>
          {selected && <p className="text-xs text-zinc-500">{selected.hint}</p>}
        </div>

        <div className="mb-6 max-w-xl space-y-2">
          <Label htmlFor="label">Label (optional)</Label>
          <Input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. uma-admin-1"
          />
        </div>

        <div className="max-w-xl">
          <Button
            onClick={handleSubmit}
            disabled={submitting || mnemonicExists === false}
          >
            {submitting
              ? "Initializing…"
              : `Initialize ${selected?.label ?? type}`}
          </Button>

          {submitError && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {submitError}
            </p>
          )}

          {result && (
            <div className="mt-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <h3 className="mb-2 font-medium">Workflow started</h3>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1 font-mono text-xs">
                <dt className="text-zinc-500">Address</dt>
                <dd className="break-all">{result.address}</dd>
                <dt className="text-zinc-500">Type</dt>
                <dd>{result.type}</dd>
                <dt className="text-zinc-500">Init status</dt>
                <dd>
                  <Badge>{result.initStatus}</Badge>
                </dd>
                <dt className="text-zinc-500">Wallet ID</dt>
                <dd>{result.wallet_id}</dd>
                <dt className="text-zinc-500">Workflow ID</dt>
                <dd className="break-all">{result.workflow_id}</dd>
              </dl>
            </div>
          )}
        </div>
      </section>

      {/* --- Existing wallets --- */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Existing wallets{total > 0 ? ` (${total})` : ""}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchWallets(page)}
            disabled={listLoading}
          >
            {listLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            placeholder="Address contains…"
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
            placeholder="Label contains…"
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-8 w-40 text-xs"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>

        {listError && (
          <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {listError}
          </p>
        )}

        {/* Table */}
        {listLoading && wallets.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
        ) : wallets.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            No wallets match the filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium text-zinc-500">ID</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">
                    Address
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Type</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Init</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">
                    Status
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-500">
                    Active
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Nonce</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">Label</th>
                  <th className="px-3 py-2 font-medium text-zinc-500">
                    Created
                  </th>
                  <th className="px-3 py-2 font-medium text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {wallets.map((w: any) => (
                  <tr
                    key={w.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    title={
                      w.init_error ? `Init error: ${w.init_error}` : undefined
                    }
                  >
                    <td className="px-3 py-2 font-mono text-zinc-500">
                      {w.id}
                    </td>
                    <td className="px-3 py-2 font-mono">{w.address}</td>
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
                      <Badge
                        className={
                          initStatusColors[w.init_status] ||
                          "bg-zinc-100 text-zinc-800"
                        }
                      >
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
                    <td className="px-3 py-2 font-mono">{w.current_nonce}</td>
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
          <div className="mt-3 flex items-center justify-between">
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
      </section>

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
