import { NextResponse } from "next/server";
import { effacerCookieSession } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  effacerCookieSession(res);
  return res;
}
