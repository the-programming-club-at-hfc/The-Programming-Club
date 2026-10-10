import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { clerkMiddleware } from "@clerk/tanstack-react-start/server";

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, clerkMiddleware({ publishableKey: import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY as string })],
}));
