import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Toast } from "@base-ui/react/toast";
import { ConvexError } from "convex/values";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmRequest = {
  id: number;
  options: ConfirmOptions;
  source: HTMLElement | null;
  theme: string;
  resolve: (confirmed: boolean) => void;
  unsubscribe: () => void;
};

type Notify = {
  error: (error: unknown) => void;
  info: (message: string) => void;
};

type Feedback = {
  confirm: (options: ConfirmOptions, signal: AbortSignal) => Promise<boolean>;
  notify: Notify;
};

const FeedbackContext = createContext<Feedback | null>(null);

/** A new lifetime on StrictMode replay; callbacks retained after unmount remain cancelled. */
function useLifetime() {
  const lifetime = useRef(new AbortController());
  useLayoutEffect(() => {
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    const controller = lifetime.current;
    return () => controller.abort();
  }, []);
  return lifetime;
}

function useFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("Feedback hooks require FeedbackProvider.");
  return feedback;
}

/** Pending confirmations are cancelled when their calling component unmounts. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const { confirm } = useFeedback();
  const lifetime = useLifetime();
  return useCallback(
    (options: ConfirmOptions) => {
      const signal = lifetime.current.signal;
      return confirm(options, signal).then((confirmed) => confirmed && !signal.aborted);
    },
    [confirm, lifetime],
  );
}

export function useNotify(): Notify {
  const { notify } = useFeedback();
  const lifetime = useLifetime();
  return useMemo(
    () => ({
      error: (error: unknown) => {
        if (!lifetime.current.signal.aborted) notify.error(error);
      },
      info: (message: string) => {
        if (!lifetime.current.signal.aborted) notify.info(message);
      },
    }),
    [notify, lifetime],
  );
}

function themeAt(source: Element | null) {
  // Copy the route's theme onto the portal even when fullscreen requires another container.
  const themes = new Set<string>();
  for (let element = source; element; element = element.parentElement) {
    for (const name of element.classList) {
      if (name.startsWith("theme-")) themes.add(name);
    }
  }
  return [...themes].join(" ");
}

function canRestoreFocus(origin: HTMLElement) {
  return (
    origin.isConnected &&
    origin.getClientRects().length > 0 &&
    !origin.matches(":disabled") &&
    !origin.closest("[inert]") &&
    (!origin.ownerDocument.fullscreenElement || origin.ownerDocument.fullscreenElement.contains(origin))
  );
}

function restoreWhenEnabled(origin: HTMLElement, isCurrent: () => boolean) {
  const doc = origin.ownerDocument;
  const stop = () => {
    observer.disconnect();
    doc.removeEventListener("focusin", stop, true);
    doc.removeEventListener("pointerdown", stop, true);
    doc.removeEventListener("keydown", stop, true);
  };
  const observer = new MutationObserver(() => {
    if (!isCurrent() || !origin.isConnected) {
      stop();
      return;
    }
    if (origin.matches(":disabled")) return;
    stop();
    if (doc.activeElement === doc.body && canRestoreFocus(origin)) origin.focus({ preventScroll: true });
  });
  // Awaiting callers can keep their trigger disabled until after Base UI's focus cleanup.
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
  doc.addEventListener("focusin", stop, true);
  doc.addEventListener("pointerdown", stop, true);
  doc.addEventListener("keydown", stop, true);
  return stop;
}

function errorMessage(error: unknown) {
  if (error instanceof ConvexError) return typeof error.data === "string" ? error.data : "That didn’t work. Please try again.";
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "That didn’t work. Check your connection and try again.";
}

/** Import this provider directly for component tests without Clerk or Convex auth. */
export function FeedbackProvider({ children }: { children: ReactNode }): ReactNode {
  return (
    <Toast.Provider limit={Infinity}>
      <FeedbackController>{children}</FeedbackController>
    </Toast.Provider>
  );
}

function FeedbackController({ children }: { children: ReactNode }) {
  const { add } = Toast.useToastManager<{ theme: string }>();
  // The ref owns requests and resolvers; React state is only the currently displayed snapshot.
  const queue = useRef<ConfirmRequest[]>([]);
  const nextId = useRef(0);
  const lastSource = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  const [active, setActive] = useState<ConfirmRequest | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // Also clears a snapshot cancelled by StrictMode's cleanup before effect replay.
    setActive(queue.current[0] ?? null);
    return () => {
      const pending = queue.current;
      queue.current = [];
      for (const request of pending) {
        request.unsubscribe();
        request.resolve(false);
      }
    };
  }, []);

  useEffect(() => {
    const updateContainer = () => {
      const fullscreen = document.fullscreenElement;
      setContainer(fullscreen instanceof HTMLElement ? fullscreen : document.body);
    };
    const rememberSource = (event: Event) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-feedback]")) return;
      const origin = event.target.closest("button, a, input, textarea, select, [tabindex]") ?? event.target;
      if (origin instanceof HTMLElement) lastSource.current = origin;
    };
    updateContainer();
    document.addEventListener("fullscreenchange", updateContainer);
    document.addEventListener("focusin", rememberSource, true);
    document.addEventListener("pointerdown", rememberSource, true);
    return () => {
      pendingFocus.current?.();
      document.removeEventListener("fullscreenchange", updateContainer);
      document.removeEventListener("focusin", rememberSource, true);
      document.removeEventListener("pointerdown", rememberSource, true);
    };
  }, []);

  const source = useCallback(() => {
    if (lastSource.current?.isConnected) return lastSource.current;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest("[data-feedback]")) return focused;
    return queue.current[0]?.source ?? null;
  }, []);

  const finish = useCallback((request: ConfirmRequest, confirmed: boolean) => {
    const index = queue.current.indexOf(request);
    // A close event, owner cancellation, or stale click may arrive after the first resolution.
    if (index === -1) return;
    queue.current.splice(index, 1);
    request.unsubscribe();
    if (index === 0) setActive(queue.current[0] ?? null);
    request.resolve(confirmed);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions, signal: AbortSignal): Promise<boolean> => {
      if (signal.aborted) return Promise.resolve(false);
      pendingFocus.current?.();
      const origin = source();
      return new Promise<boolean>((resolve) => {
        const cancel = () => finish(request, false);
        const request: ConfirmRequest = {
          id: ++nextId.current,
          options: { ...options },
          source: origin,
          theme: themeAt(origin ?? document.fullscreenElement),
          resolve,
          unsubscribe: () => signal.removeEventListener("abort", cancel),
        };
        signal.addEventListener("abort", cancel, { once: true });
        queue.current.push(request);
        if (queue.current.length === 1) setActive(request);
      });
    },
    [finish, source],
  );

  const notify = useMemo<Notify>(
    () => ({
      error: (error) => {
        add({
          title: "Something went wrong",
          description: errorMessage(error),
          type: "error",
          priority: "high",
          timeout: 0,
          data: { theme: themeAt(source() ?? document.fullscreenElement) },
        });
      },
      info: (message) => {
        add({ title: message, type: "info", timeout: 6000, data: { theme: themeAt(source() ?? document.fullscreenElement) } });
      },
    }),
    [add, source],
  );
  const feedback = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
      {active && (
        <Confirmation
          key={active.id}
          request={active}
          container={container}
          finish={finish}
          finalFocus={() => {
            // A previous dialog must never steal focus from the next queued dialog or a remounted portal.
            pendingFocus.current?.();
            if (queue.current.length) return false;
            const origin = active.source;
            if (!origin?.isConnected) return false;
            if (origin.matches(":disabled")) {
              pendingFocus.current = restoreWhenEnabled(origin, () => !queue.current.length);
              return false;
            }
            return canRestoreFocus(origin) ? origin : false;
          }}
        />
      )}
      <Notifications container={container} />
    </FeedbackContext.Provider>
  );
}

function Confirmation({
  request,
  container,
  finish,
  finalFocus,
}: {
  request: ConfirmRequest;
  container: HTMLElement | null;
  finish: (request: ConfirmRequest, confirmed: boolean) => void;
  finalFocus: () => boolean | HTMLElement;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const { options } = request;
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && finish(request, false)}>
      <AlertDialog.Portal container={container} className={request.theme} data-feedback="confirmation">
        <AlertDialog.Backdrop className="fixed inset-0 z-[100] bg-black/60" />
        <AlertDialog.Viewport className="fixed inset-0 z-[101] grid items-center justify-items-center overflow-y-auto overscroll-contain p-3 sm:p-6">
          <AlertDialog.Popup
            initialFocus={cancel}
            finalFocus={finalFocus}
            className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto bg-paper p-5 text-ink shadow-xl sm:p-8"
          >
            <AlertDialog.Title className="text-2xl break-words">{options.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-4 break-words whitespace-pre-wrap text-dim">
              {options.description}
            </AlertDialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <AlertDialog.Close ref={cancel} className="btn">
                {options.cancelLabel ?? "Cancel"}
              </AlertDialog.Close>
              <button
                type="button"
                className={`btn ${options.destructive ? "btn-neon" : "btn-primary"}`}
                onClick={() => finish(request, true)}
              >
                {options.confirmLabel}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function Notifications({ container }: { container: HTMLElement | null }) {
  const { toasts } = Toast.useToastManager<{ theme: string }>();
  return (
    <Toast.Portal container={container} data-feedback="notifications">
      <Toast.Viewport className="fixed right-3 bottom-3 z-[110] flex max-h-[45dvh] w-[calc(100%-1.5rem)] max-w-md flex-col gap-3 overflow-y-auto overscroll-contain rounded-lg outline-offset-2 sm:right-6 sm:bottom-6">
        {/* This list stays expanded visually, so keep every toast and dismiss control accessible. */}
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            aria-hidden={false}
            swipeDirection={[]}
            className={`${toast.data?.theme ?? ""} card shrink-0 bg-paper p-4 text-ink shadow-xl ${toast.type === "error" ? "border-2 border-signal" : ""}`}
          >
            <Toast.Content>
              <Toast.Title className="font-bold break-words" />
              <Toast.Description className="mt-1 break-words whitespace-pre-wrap" />
              <Toast.Close className="btn btn-sm mt-3" aria-label="Dismiss notification" aria-hidden={false}>
                Dismiss
              </Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
