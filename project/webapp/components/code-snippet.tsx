/**
 * A small, unhighlighted code block - no syntax-highlighting library, same
 * "no new dependency for something this small" principle the rest of the
 * app follows for diagrams and charts. `source` is always a real,
 * repo-relative path (never a paraphrase), so a reader can go check it.
 */
export function CodeSnippet({
  source,
  code,
}: Readonly<{ source: string; code: string }>) {
  return (
    <div className="space-y-1">
      <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
      <p className="text-[11px] text-muted-foreground">
        Source: <code className="rounded bg-muted px-1 py-0.5">{source}</code>
      </p>
    </div>
  );
}
