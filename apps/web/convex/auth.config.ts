import type { AuthConfig } from "convex/server";

// Clerk issues a "convex" JWT template token; CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment.
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }],
} satisfies AuthConfig;
