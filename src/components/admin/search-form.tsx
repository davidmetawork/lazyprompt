import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Plain GET form (works without JS). `hidden` carries extra params such as the active status filter. */
export function AdminSearchForm({
  action, q, placeholder, hidden = {}, children,
}: {
  action: string; q?: string; placeholder: string; hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" role="search" className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor="admin-q" className="sr-only">Search</Label>
        <Input id="admin-q" name="q" type="search" defaultValue={q ?? ""} placeholder={placeholder} className="w-64 max-w-full" maxLength={200} />
      </div>
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {children}
      <Button type="submit" variant="outline"><Search /> Search</Button>
    </form>
  );
}
