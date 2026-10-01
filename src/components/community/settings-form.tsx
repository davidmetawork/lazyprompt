"use client";
import { useActionState, useEffect, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateProfileAction, type ProfileActionState } from "@/actions/profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldMessages, friendlyFieldErrors } from "./helpers";
import { useActionFailure } from "./use-action-failure";

export interface SettingsFormProps { username: string; bio: string; website: string }

export function SettingsForm(initial: SettingsFormProps) {
  const uid = useId();
  const fail = useActionFailure();
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [website, setWebsite] = useState(initial.website);
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(updateProfileAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("Profile updated");
    else if (state.code === "UNAUTHENTICATED") fail(state);
  }, [state, fail]);

  const fe = state && !state.ok ? friendlyFieldErrors(state.fieldErrors) : undefined;
  const usernameErrors = fieldMessages(fe, "username");
  const conflict = state && !state.ok && state.code === "CONFLICT";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("username", username);
    fd.set("bio", bio);
    fd.set("website", website);
    startTransition(() => formAction(fd));
  }

  const field = (name: string, label: string, hint: string | undefined, errs: string[], control: ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${uid}-${name}`}>{label}</Label>
      {control}
      {hint ? <p id={`${uid}-${name}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {errs.length > 0 ? <p role="alert" className="text-sm text-destructive">{errs.join(" ")}</p> : null}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={pending}>
      {state && !state.ok && !fe && !conflict && state.code !== "UNAUTHENTICATED" ? (
        <Alert variant="destructive" role="alert"><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : null}
      {state?.ok ? <p role="status" className="text-sm text-muted-foreground">Saved. Your profile is at /u/{state.data.username}.</p> : null}

      {field("username", "Username", "3-30 characters: lowercase letters, numbers, _ or -. Your profile lives at /u/username.",
        conflict ? [state.message || "That username is taken"] : usernameErrors,
        <Input id={`${uid}-username`} name="username" value={username} autoComplete="username" required minLength={3} maxLength={30}
          aria-invalid={usernameErrors.length > 0 || Boolean(conflict)} aria-describedby={`${uid}-username-hint`}
          onChange={(e) => setUsername(e.target.value.toLowerCase())} />)}

      {field("bio", "Bio", `${bio.length}/280`, fieldMessages(fe, "bio"),
        <Textarea id={`${uid}-bio`} name="bio" rows={3} maxLength={280} value={bio}
          aria-describedby={`${uid}-bio-hint`} onChange={(e) => setBio(e.target.value)} />)}

      {field("website", "Website", "Optional. Must start with https://", fieldMessages(fe, "website"),
        <Input id={`${uid}-website`} name="website" type="url" inputMode="url" maxLength={200} value={website}
          placeholder="https://example.com" aria-describedby={`${uid}-website-hint`} onChange={(e) => setWebsite(e.target.value)} />)}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save changes
      </Button>
    </form>
  );
}
