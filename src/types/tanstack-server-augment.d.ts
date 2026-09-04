// TanStack's server-route (`server: { handlers: { ... } }`) config is handled at
// runtime by the Start Vite plugin but not yet declared in the router's TS
// types on the pinned version. Augment the base extension interface so
// auto-generated MCP route files typecheck.
declare module "@tanstack/router-core" {
  interface UpdatableRouteOptionsExtensions {
    server?: {
      middleware?: readonly unknown[];
      handlers?: unknown;
    };
  }
}
export {};
