import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { RESULTS_DIR, RESULTS_V2_DIR } from "@/lib/config";

// Serves the .png plots already committed under project/results(_v2)/ - the
// only files this route will ever return. Both roots are allowlisted by
// name (never an arbitrary path from the request) and every resolved path
// is re-checked to still live under one of them, so a segment like
// "../../../../some/other/file" can't escape the two result directories.
const ALLOWED_ROOTS: Record<string, string> = {
  results: RESULTS_DIR,
  results_v2: RESULTS_V2_DIR,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params;
  const [rootKey, ...rest] = segments ?? [];
  const root = ALLOWED_ROOTS[rootKey];
  if (!root || rest.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const resolved = path.resolve(root, ...rest);
  if (!resolved.startsWith(path.resolve(root) + path.sep) || !resolved.endsWith(".png")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const bytes = fs.readFileSync(resolved);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
