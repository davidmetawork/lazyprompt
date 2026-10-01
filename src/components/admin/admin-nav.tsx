"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Flag, Inbox, LayoutDashboard, ScrollText, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/queue", label: "Queue", icon: Inbox, badge: "queue" },
  { href: "/admin/reports", label: "Reports", icon: Flag, badge: "reports" },
  { href: "/admin/prompts", label: "Prompts", icon: FileText },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/log", label: "Log", icon: ScrollText },
] as const;

export function AdminNav({ counts }: { counts: { queue: number | null; reports: number | null } }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = "exact" in item && item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const count = "badge" in item ? counts[item.badge] : null;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{item.label}</span>
            {count ? (
              <Badge variant="secondary" className="ml-auto" aria-label={`${count} waiting`}>{count}</Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
