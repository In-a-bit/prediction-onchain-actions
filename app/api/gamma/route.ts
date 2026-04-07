import { NextRequest, NextResponse } from "next/server";

const GAMMA_API = "https://gamma-api.polymarket.com";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const path = searchParams.get("path") || "";

  const fwd = new URLSearchParams(searchParams);
  fwd.delete("path");

  const url = `${GAMMA_API}/${path}?${fwd}`;
  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
