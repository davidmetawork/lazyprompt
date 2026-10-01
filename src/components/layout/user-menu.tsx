"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Bookmark, FileText, Settings, Shield, User as UserIcon } from "lucide-react";
import { authClient } from "@/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  user,
}: { user: { name: string; username: string; image: string | null; role: "user" | "admin" } }) {
  const router = useRouter();
  const initials = (user.name || user.username).slice(0, 2).toUpperCase();
  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open user menu" data-testid="user-menu">
          <Avatar className="size-7">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href={`/u/${user.username}`}><UserIcon /> Profile</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/me/prompts"><FileText /> My prompts</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/me/saved"><Bookmark /> Saved</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        {user.role === "admin" ? (
          <DropdownMenuItem asChild><Link href="/admin"><Shield /> Admin</Link></DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
