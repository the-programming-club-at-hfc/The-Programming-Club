import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { Wrap } from "#/components/ui";

export const Route = createFileRoute("/sign-in/$")({ component: Page });

function Page() {
  return (
    <Wrap className="grid min-h-[60vh] place-items-center py-10">
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/hello-world/host" />
    </Wrap>
  );
}
