import { redirect } from "next/navigation";
import { requireViewer } from "@/auth/viewer";

export default async function MePage() {
  const viewer = await requireViewer("/me");
  redirect(`/u/${viewer.username}`);
}
