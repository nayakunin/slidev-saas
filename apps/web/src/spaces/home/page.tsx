import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { getSignInUrlFn } from "@/integrations/workos/auth.functions";

export function HomePage() {
  const getSignInUrl = useServerFn(getSignInUrlFn);

  async function handleSignIn() {
    const url = await getSignInUrl();
    window.location.href = url;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground text-3xl font-bold text-background">
          S
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Presentation Editor
          </h1>
          <p className="text-lg text-muted-foreground">
            Create and preview markdown-based presentations instantly in the browser.
          </p>
        </div>
        <Button onClick={() => void handleSignIn()} size="lg">
          Get Started
        </Button>
      </div>
    </div>
  );
}
