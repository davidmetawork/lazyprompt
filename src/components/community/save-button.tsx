// PLACEHOLDER owned by community-ui.
export interface SaveButtonProps { promptId: string; slug: string; saved: boolean; saveCount: number; signedIn: boolean }

export function SaveButton({ saved, saveCount }: SaveButtonProps) {
  return <span className="text-sm text-muted-foreground">{saved ? "Saved" : "Save"} ({saveCount})</span>;
}
