import { NextResponse } from "next/server";
import { loadReferenceTrial } from "@/lib/results";

export async function GET() {
  const trial = loadReferenceTrial();
  if (!trial) {
    return NextResponse.json({ error: "reference trial not found" }, { status: 404 });
  }
  return NextResponse.json(trial);
}
