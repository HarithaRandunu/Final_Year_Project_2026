import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <section className="space-y-4">
      <Alert>
        <Compass />
        <AlertTitle>Page not found</AlertTitle>
        <AlertDescription>
          There&apos;s no section at this address. Use the nav bar above, or head back to
          the Research Overview page.
        </AlertDescription>
      </Alert>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to Research Overview
      </Link>
    </section>
  );
}
