import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title, description, action, icon, className,
}: { title: string; description?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <h3 className="text-base font-medium">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
