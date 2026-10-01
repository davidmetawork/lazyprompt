import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({
  children, className, as: Tag = "div",
}: { children: ReactNode; className?: string; as?: "div" | "main" | "section" | "header" | "footer" }) {
  return <Tag className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</Tag>;
}
