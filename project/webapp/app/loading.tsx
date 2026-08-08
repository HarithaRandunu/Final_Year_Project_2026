import { CardSkeleton } from "@/components/loading-state";
import { Skeleton } from "@/components/ui/skeleton";

// Next.js's own route-loading convention: shown automatically while a page
// (or any async work inside it) is still resolving on the server, before
// swapping in the real content. Matters most from Phase 4 onward, once pages
// read files or poll a live cluster instead of rendering static text.
export default function Loading() {
  return (
    <section className="space-y-6">
      <Skeleton className="h-9 w-72" />
      <CardSkeleton />
    </section>
  );
}
