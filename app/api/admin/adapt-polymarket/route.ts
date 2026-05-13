import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";

const GAMMA_API = "https://gamma-api.polymarket.com";

const SeriesSchema = z.object({
  slug: z.string(),
  title: z.string(),
  ticker: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  series_type: z.string().optional(),
  recurrence: z.string().optional(),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  featured: z.boolean().default(false),
  new: z.boolean().default(false),
  requires_translation: z.boolean().default(false),
  comment_count: z.number().int().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const EventSchema = z.object({
  slug: z.string(),
  title: z.string(),
  ticker: z.string().optional(),
  description: z.string().optional(),
  resolution_source: z.string().optional(),
  start_date: z.string().optional().describe("ISO 8601 datetime"),
  end_date: z.string().optional().describe("ISO 8601 datetime"),
  icon: z.string().optional(),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  neg_risk: z.boolean().default(false),
  neg_risk_market_id: z.string().optional(),
  deployment_status: z.enum(["PENDING", "DEPLOYING", "DEPLOYED"]).default("PENDING"),
  comment_count: z.number().int().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const MarketSchema = z.object({
  question: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  resolution_source: z.string().optional(),
  start_date: z.string().optional().describe("ISO 8601 datetime"),
  end_date: z.string().optional().describe("ISO 8601 datetime"),
  active: z.boolean().default(true),
  closed: z.boolean().default(false),
  archived: z.boolean().default(false),
  restricted: z.boolean().default(false),
  neg_risk: z.boolean().default(false),
  neg_risk_market_id: z.string().optional(),
  neg_risk_request_id: z.string().optional(),
  neg_risk_other: z.boolean().default(false),
  accepting_orders: z.boolean().default(true),
  accepting_orders_timestamp: z.string().optional(),
  funded: z.boolean().default(false),
  approved: z.boolean().default(false),
  activation: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
  automatically_active: z.boolean().default(false),
  clear_book_on_start: z.boolean().default(false),
  rfq_enabled: z.boolean().default(false),
  order_price_min_tick_size: z.number().optional(),
  order_min_size: z.number().int().optional(),
  uma_bond: z.string().optional().describe("integer string in wei"),
  uma_reward: z.string().optional().describe("integer string in wei"),
  uma_resolution_status: z.string().optional(),
  liveness: z.string().optional(),
  metadata_type: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const TagSchema = z.object({
  slug: z.string().describe("URL-safe slug, e.g. 'politics'"),
  label: z.string().describe("Human-readable display label, e.g. 'Politics'"),
});

const AdaptResultSchema = z.object({
  series: SeriesSchema.nullable().describe("Set to null when Polymarket event has no parent series"),
  event: EventSchema,
  markets: z.array(MarketSchema).min(1),
  tags: z.array(TagSchema).default([]).describe("Tags pulled from Polymarket tags[] — will be upserted by slug on submit"),
});

export type AdaptResult = z.infer<typeof AdaptResultSchema>;

export async function POST(req: NextRequest) {
  let slug: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    slug = (body?.slug || "").trim();
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY not configured on server" },
        { status: 500 }
      );
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
    }

    const gammaUrl = `${GAMMA_API}/events/slug/${encodeURIComponent(slug)}`;
    const gammaRes = await fetch(gammaUrl, { cache: "no-store" });
    if (!gammaRes.ok) {
      const text = await gammaRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Polymarket gamma returned ${gammaRes.status}: ${text || gammaRes.statusText}` },
        { status: 502 }
      );
    }
    const polymarket = await gammaRes.json();

    const promptInput = JSON.stringify(polymarket).slice(0, 180_000);

    const { output } = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: AdaptResultSchema }),
      system: [
        "You convert a Polymarket gamma API event payload into our internal Series/Event/Market payload shape.",
        "Rules:",
        "- Preserve slugs, titles, dates, icons, and flags as faithfully as possible.",
        "- Convert all datetime fields to ISO 8601 strings (e.g. 2025-12-31T12:00:00Z).",
        "- `event.metadata_type` should be a short free-form classifier inferred from tags (e.g. 'politics', 'sports', 'crypto').",
        "- `event.metadata` should be the Polymarket `eventMetadata` object verbatim if present, otherwise an empty object.",
        "- `event.neg_risk` mirrors Polymarket `negRisk`. `event.deployment_status` should default to 'PENDING'.",
        "- For each market: copy `question`, `slug`, `description`, `resolution_source` (from resolutionSource), `start_date`/`end_date`, `neg_risk`, `accepting_orders`, `funded`, `approved`, `rfq_enabled`, `order_price_min_tick_size` (orderPriceMinTickSize), `order_min_size` (orderMinSize), `uma_bond` (umaBond), `uma_reward` (umaReward), `uma_resolution_status` (umaResolutionStatus).",
        "- `market.metadata_type` should match `event.metadata_type`.",
        "- `market.metadata` may include the market-level groupItemTitle/groupItemThreshold under {polymarket_group_item_title, polymarket_group_item_threshold} when present.",
        "- Skip markets whose `closed` is true UNLESS the entire event has only closed markets, in which case include them all.",
        "- Series: only emit when the Polymarket payload has a real series/parent grouping (e.g. a `series` field, or `seriesType`/recurrence on the event itself). Otherwise return null.",
        "- Tags: for every entry in the Polymarket `tags[]` array, emit {slug, label} verbatim. Drop duplicates by slug. Do not invent new tags — only what is in the payload.",
        "- Never invent IDs. Never include external IDs from Polymarket — our system generates them.",
        "- Output VALID values matching the schema exactly.",
      ].join("\n"),
      prompt: `Polymarket gamma event payload (JSON):\n${promptInput}`,
    });

    return NextResponse.json({ data: output, source: { slug, gammaUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[adapt-polymarket] failed", { slug, err: message });
    return NextResponse.json(
      { error: message || "adaptation failed" },
      { status: 500 }
    );
  }
}
