"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hexlify, toUtf8Bytes } from "ethers";
import {
  fetchContractAddress,
  initializeMarket,
  callWriteFunction,
  callReadFunction,
} from "@/lib/contracts/actions";

type StepStatus = "idle" | "loading" | "success" | "error";

interface StepState {
  status: StepStatus;
  result?: string;
  error?: string;
}

export default function CreateMarketPage() {
  const [questionText, setQuestionText] = useState("");
  const [rewardToken, setRewardToken] = useState("");
  const [reward, setReward] = useState("0");
  const [proposalBond, setProposalBond] = useState("0");
  const [liveness, setLiveness] = useState("0");
  const [collateralAddress, setCollateralAddress] = useState("");
  const [adapterAddress, setAdapterAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");

  const [step1, setStep1] = useState<StepState>({ status: "idle" });
  const [step2, setStep2] = useState<StepState>({ status: "idle" });
  const [step3, setStep3] = useState<StepState>({ status: "idle" });

  const [questionID, setQuestionID] = useState("");
  const [conditionId, setConditionId] = useState("");
  const [yesTokenId, setYesTokenId] = useState("");
  const [noTokenId, setNoTokenId] = useState("");

  useEffect(() => {
    fetchContractAddress("collateral").then((addr) => {
      setCollateralAddress(addr);
      setRewardToken(addr);
    }).catch(() => {});
    fetchContractAddress("uma-ctf-adapter").then(setAdapterAddress).catch(() => {});
  }, []);

  const questionHex = questionText
    ? hexlify(toUtf8Bytes(questionText))
    : "";

  const canStep1 =
    questionText && rewardToken && privateKey && step1.status !== "loading";
  const canStep2 = step1.status === "success" && questionID && step2.status !== "loading";
  const canStep3 =
    step2.status === "success" &&
    yesTokenId &&
    noTokenId &&
    step3.status !== "loading";

  function resetSteps() {
    setStep1({ status: "idle" });
    setStep2({ status: "idle" });
    setStep3({ status: "idle" });
    setQuestionID("");
    setConditionId("");
    setYesTokenId("");
    setNoTokenId("");
  }

  async function handleInitialize() {
    setStep1({ status: "loading" });
    const result = await initializeMarket(
      questionText,
      rewardToken,
      reward,
      proposalBond,
      liveness,
      privateKey
    );
    if (result.success) {
      setStep1({ status: "success", result: result.txHash });
      setQuestionID(result.questionID);
      // Auto-trigger step 2
      handleDeriveTokenIds(result.questionID);
    } else {
      setStep1({ status: "error", error: result.error });
    }
  }

  async function handleDeriveTokenIds(qID?: string) {
    const activeQuestionID = qID || questionID;
    setStep2({ status: "loading" });
    try {
      // The adapter uses itself as oracle: ctf.prepareCondition(address(this), questionID, 2)
      const condRes = await callReadFunction(
        "conditional-tokens",
        "getConditionId",
        [adapterAddress, activeQuestionID, 2]
      );
      if (!condRes.success) {
        setStep2({ status: "error", error: condRes.error });
        return;
      }
      const cId = condRes.result;
      setConditionId(cId);

      const [collYes, collNo] = await Promise.all([
        callReadFunction("conditional-tokens", "getCollectionId", [
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          cId,
          2,
        ]),
        callReadFunction("conditional-tokens", "getCollectionId", [
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          cId,
          1,
        ]),
      ]);

      if (!collYes.success) {
        setStep2({ status: "error", error: collYes.error });
        return;
      }
      if (!collNo.success) {
        setStep2({ status: "error", error: collNo.error });
        return;
      }

      const [yesPos, noPos] = await Promise.all([
        callReadFunction("conditional-tokens", "getPositionId", [
          collateralAddress,
          collYes.result,
        ]),
        callReadFunction("conditional-tokens", "getPositionId", [
          collateralAddress,
          collNo.result,
        ]),
      ]);

      if (!yesPos.success) {
        setStep2({ status: "error", error: yesPos.error });
        return;
      }
      if (!noPos.success) {
        setStep2({ status: "error", error: noPos.error });
        return;
      }

      setYesTokenId(yesPos.result);
      setNoTokenId(noPos.result);
      setStep2({ status: "success" });
    } catch (e: any) {
      setStep2({ status: "error", error: e.message || "Unknown error" });
    }
  }

  async function handleRegisterToken() {
    setStep3({ status: "loading" });
    const result = await callWriteFunction("ctf-exchange", "registerToken", [
      yesTokenId,
      noTokenId,
      conditionId,
    ]);
    if (result.success) {
      setStep3({ status: "success", result: result.txHash });
    } else {
      setStep3({ status: "error", error: result.error });
    }
  }

  function statusBadge(status: StepStatus) {
    switch (status) {
      case "idle":
        return <Badge variant="secondary">Pending</Badge>;
      case "loading":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Loading...
          </Badge>
        );
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Success
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Error
          </Badge>
        );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Create Market</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Create a binary YES/NO market via UMA CTF Adapter
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Inputs */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">Market Configuration</h3>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">
                  Question (Ancillary Data)
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  The yes/no question — will be encoded as bytes and passed to
                  the UMA oracle
                </p>
                <textarea
                  placeholder="Will ETH reach $10,000 by end of 2026?"
                  value={questionText}
                  onChange={(e) => {
                    setQuestionText(e.target.value);
                    resetSteps();
                  }}
                  rows={2}
                  className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Reward Token</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  ERC20 token for rewards/fees — must be whitelisted. Pre-filled
                  with collateral address.
                </p>
                <Input
                  placeholder="0x..."
                  value={rewardToken}
                  onChange={(e) => setRewardToken(e.target.value.trim())}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm font-medium">Reward</Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    OO proposer reward (wei). 0 = none.
                  </p>
                  <Input
                    placeholder="0"
                    value={reward}
                    onChange={(e) => setReward(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Proposal Bond</Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    OO bond (wei). 0 = default.
                  </p>
                  <Input
                    placeholder="0"
                    value={proposalBond}
                    onChange={(e) => setProposalBond(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Liveness</Label>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Seconds. 0 = default (2h).
                  </p>
                  <Input
                    placeholder="0"
                    value={liveness}
                    onChange={(e) => setLiveness(e.target.value.trim())}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">
                  Collateral Address
                </Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Used in Step 2 to derive position/token IDs
                </p>
                <Input
                  placeholder="0x..."
                  value={collateralAddress}
                  onChange={(e) => setCollateralAddress(e.target.value.trim())}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Private Key</Label>
                <p className="mb-1.5 text-xs text-zinc-500">
                  Used to sign the initialize transaction (Step 1). If reward
                  &gt; 0, this wallet must have approved the adapter to spend
                  the reward token.
                </p>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value.trim())}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Derived values */}
          {questionText && (
            <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <h3 className="text-lg font-semibold">Derived Values</h3>
              </div>
              <div className="space-y-3 p-6">
                <div>
                  <Label className="text-xs font-medium text-zinc-500">
                    Hex-encoded Ancillary Data
                  </Label>
                  <code className="mt-1 block break-all rounded bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                    {questionHex}
                  </code>
                </div>
                <p className="text-xs text-zinc-400">
                  Note: the final questionID is computed on-chain by the adapter
                  (it appends msg.sender to the ancillary data before hashing).
                </p>
              </div>
            </div>
          )}

          {/* Step 1 */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 1: Initialize Market
                </h3>
                {statusBadge(step1.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Calls <code className="text-xs">initialize()</code> on the UMA
                CTF Adapter — atomically prepares the condition on CTF and
                requests a price from the OO
              </p>
            </div>
            <div className="space-y-3 p-6">
              <Button
                onClick={handleInitialize}
                disabled={!canStep1}
                className="w-full"
              >
                {step1.status === "loading"
                  ? "Initializing..."
                  : "Initialize Market"}
              </Button>
              {step1.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step1.error}
                </div>
              )}
              {step1.status === "success" && (
                <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      Transaction Hash
                    </Label>
                    <a
                      href={`https://amoy.polygonscan.com/tx/${step1.result}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                    >
                      {step1.result}
                    </a>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      Question ID (from event)
                    </Label>
                    <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                      {questionID}
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 2: Derive Token IDs
                </h3>
                {statusBadge(step2.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Read calls on conditional-tokens using the adapter as oracle
              </p>
            </div>
            <div className="space-y-3 p-6">
              <Button
                onClick={() => handleDeriveTokenIds()}
                disabled={!canStep2}
                variant="outline"
                className="w-full"
              >
                {step2.status === "loading"
                  ? "Deriving..."
                  : "Derive Token IDs"}
              </Button>
              {step2.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step2.error}
                </div>
              )}
              {step2.status === "success" && (
                <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      Condition ID
                    </Label>
                    <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                      {conditionId}
                    </code>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      YES Token ID
                    </Label>
                    <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                      {yesTokenId}
                    </code>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                      NO Token ID
                    </Label>
                    <code className="mt-1 block break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-zinc-900">
                      {noTokenId}
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Step 3: Register on Exchange
                </h3>
                {statusBadge(step3.status)}
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Write transaction on ctf-exchange using exchange admin key
              </p>
            </div>
            <div className="space-y-3 p-6">
              <Button
                onClick={handleRegisterToken}
                disabled={!canStep3}
                className="w-full"
              >
                {step3.status === "loading"
                  ? "Registering..."
                  : "Register Token"}
              </Button>
              {step3.status === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {step3.error}
                </div>
              )}
              {step3.status === "success" && step3.result && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <Label className="text-xs font-medium text-green-800 dark:text-green-200">
                    Transaction Hash
                  </Label>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${step3.result}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all font-mono text-xs text-green-700 underline dark:text-green-300"
                  >
                    {step3.result}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
