// Imported only by browser-intercepted modules in host-controls.spec.ts.
import { forwardRef, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

let calls = [];
const listeners = new Set();
const mutations = new Map();

export function useRecordedCalls() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => calls,
  );
}

export function useMutation(reference) {
  const name = getFunctionName(reference);
  if (!mutations.has(name)) {
    mutations.set(name, (args = {}) => {
      calls = [...calls, { name, args }];
      for (const listener of listeners) listener();
      return Promise.resolve(null);
    });
  }
  return mutations.get(name);
}

export function useQuery(reference, args) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  if (name === "schedule:weeks") return undefined;
  if (name === "officers:me") return { officer: true };
  if (name === "sessions:joinCode") return "LOCAL";
  throw new Error(`Unconfigured local host query: ${name}`);
}

export function useQueries() {
  throw new Error("Host-only fixture unexpectedly rendered drawing queries");
}

export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export const useAuth = () => ({ isSignedIn: true });
export function useConvex() {
  throw new Error("A host fixture attempted to create a real Convex client");
}
export const UserButton = () => null;
export const Show = ({ children }) => children;
export const SignInButton = Show;
export const SignOutButton = Show;
export const Link = forwardRef(function LocalLink({ to, children, ...props }, ref) {
  return (
    <a ref={ref} href={to} {...props}>
      {children}
    </a>
  );
});
