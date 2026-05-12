"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getMnemonicStatus,
  initMnemonic,
  type MnemonicStatus,
} from "@/lib/admin/actions";

const DEFAULT_DPM_URL = "http://localhost:8086";

export default function MnemonicPage() {
  const [dpmUrl, setDpmUrl] = useState(DEFAULT_DPM_URL);
  const [status, setStatus] = useState<MnemonicStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [initing, setIniting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getMnemonicStatus(dpmUrl);
    setLoading(false);
    if (res.success) setStatus(res.data);
    else setError(res.error);
  }, [dpmUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleInit() {
    setIniting(true);
    setError("");
    const res = await initMnemonic(dpmUrl);
    setIniting(false);
    if (res.success) setStatus(res.data);
    else setError(res.error);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">HD Mnemonic</h1>
        <p className="text-sm text-zinc-500">
          Manage the singleton mnemonic used to derive every newly-initialized
          relayer wallet. The plaintext is never returned by the API — only
          the existence flag and the highest derivation index allocated so far.
        </p>
      </div>

      <div className="mb-6 max-w-xl space-y-2">
        <Label htmlFor="dpm-url">DPM API URL</Label>
        <Input
          id="dpm-url"
          value={dpmUrl}
          onChange={(e) => setDpmUrl(e.target.value)}
          placeholder="http://localhost:8086"
        />
      </div>

      <div className="mb-6 max-w-xl rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Status</h2>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {status ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-zinc-500">Exists</dt>
            <dd>
              {status.exists ? (
                <Badge className="bg-green-500 hover:bg-green-500">Yes</Badge>
              ) : (
                <Badge variant="outline">No</Badge>
              )}
            </dd>
            <dt className="text-zinc-500">Max used index</dt>
            <dd className="font-mono">{status.max_used_index}</dd>
            {status.created_at && (
              <>
                <dt className="text-zinc-500">Created</dt>
                <dd className="font-mono">{status.created_at}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">No data.</p>
        )}
      </div>

      <div className="max-w-xl">
        <Button
          onClick={handleInit}
          disabled={initing || status?.exists === true}
          title={
            status?.exists
              ? "Mnemonic already exists. This action is one-shot."
              : "Create the singleton mnemonic"
          }
        >
          {initing
            ? "Creating…"
            : status?.exists
              ? "Mnemonic already exists"
              : "Create mnemonic"}
        </Button>
        <p className="mt-2 text-xs text-zinc-500">
          Idempotent on the server — clicking when the row already exists is a
          no-op. The button is disabled once Exists=Yes to keep the UI clear.
        </p>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
