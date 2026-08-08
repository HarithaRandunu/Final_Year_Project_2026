import { Info, FileWarning } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

/**
 * For a data block that is genuinely absent, not still loading - e.g. a
 * results JSON file that a given ablation arm never produced. Ported from
 * the deleted desktop_app's "missingBlockNote" idea: say *why* it's missing
 * (not applicable vs. not yet generated are different situations), never
 * just render blank space where a reader would otherwise wonder if
 * something broke.
 */
export function EmptyState({
  title = "Not available",
  reason,
}: {
  title?: string;
  reason: string;
}) {
  return (
    <Alert>
      <FileWarning />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
}

/** A softer, informational version - for context notes rather than a missing-data warning. */
export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <Info />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
