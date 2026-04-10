import { useServerFn } from "@tanstack/react-start";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";

import { Button } from "@/components/ui/button";

export function LandingPage() {
  const getSignInUrlFn = useServerFn(getSignInUrl);

  async function handleSignIn() {
    const url = await getSignInUrlFn();
    window.location.href = url;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground text-background text-3xl font-bold">
          S
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Presentation Editor
          </h1>
          <p className="text-muted-foreground text-lg">
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
