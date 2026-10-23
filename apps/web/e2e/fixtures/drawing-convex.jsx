// Only Sketch's convex/react import is redirected here by drawing.spec.ts.
import { useMemo, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const listeners = new Set();
let state = {
  calls: [],
  rows: [{ _id: "remote-row", stroke: "remote-stroke", color: "#111111", size: 6, points: [20, 20, 80, 80] }],
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
export const useDrawingState = () => useSyncExternalStore(subscribe, snapshot);

export function useMutation(reference) {
  const name = getFunctionName(reference);
  return useMemo(
    () => (args) => {
      let rows = state.rows;
      if (name === "drawings:ink") rows = [...rows, { ...args, _id: `local-row-${state.calls.length}` }];
      else if (name === "drawings:undo") rows = rows.filter((row) => row.stroke !== args.stroke);
      else if (name === "drawings:clear") rows = [];
      else throw new Error(`Unexpected drawing mutation: ${name}`);
      state = { calls: [...state.calls, { name, args: structuredClone(args) }], rows };
      for (const listener of listeners) listener();
      return Promise.resolve(null);
    },
    [name],
  );
}

export function useQuery(reference) {
  const current = useDrawingState();
  if (getFunctionName(reference) !== "drawings:inkBlocks") throw new Error("Unexpected drawing query");
  return current.rows.length ? 1 : 0;
}

export function useQueries(queries) {
  const current = useDrawingState();
  return Object.fromEntries(Object.keys(queries).map((key) => [key, current.rows]));
}
