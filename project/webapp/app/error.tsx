"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Next.js requires this to be a Client Component and named exactly
// error.tsx - it becomes the error boundary for everything under app/.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Something went wrong loading this page</AlertTitle>
        <AlertDescription>
          This is a read-only reporting app - a page failing to render usually means a
          results file was missing or malformed, not that anything on disk was changed.
          {error.digest ? ` (Error reference: ${error.digest})` : null}
        </AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </section>
  );
}
