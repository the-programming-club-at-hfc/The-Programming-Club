// Just enough of Bun's test runner types for `bun test` files to typecheck without adding bun-types.
declare module "bun:test" {
  interface Matchers {
    toBe: (expected: unknown) => void;
    toEqual: (expected: unknown) => void;
    toBeNull: () => void;
    toContain: (item: unknown) => void;
    toHaveLength: (n: number) => void;
  }
  interface AsyncMatchers {
    toThrow: (message?: string) => Promise<void>;
  }
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void): void;
  export function setSystemTime(now?: Date): void;
  export function expect(value: unknown): Matchers & { not: Matchers; rejects: AsyncMatchers };
}
