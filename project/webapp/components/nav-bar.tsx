"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/", label: "Research Overview" },
  { href: "/overview", label: "Project Overview" },
  { href: "/teastore", label: "TeaStore" },
  { href: "/results", label: "Training & Test Results" },
  { href: "/conclusion", label: "Final Conclusion" },
  { href: "/live", label: "Live Run" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-6 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight">Promex</span>
        <span className="text-xs text-muted-foreground">
          Multi-Signal, Co-Scheduling Autoscaling with Adaptive Control
        </span>
      </div>

      <nav className="flex flex-1 flex-wrap gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({
                variant: pathname === item.href ? "default" : "ghost",
                size: "sm",
              }),
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <ThemeToggle />
    </header>
  );
}
