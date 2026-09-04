/**
 * The build this code was produced by.
 *
 * `__BUILD_ID__` is replaced at build time by vite.config.ts, so this is a
 * literal in the output rather than a lookup. Both bundles are built together
 * and get the same value.
 */
declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
