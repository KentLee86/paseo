// This file exists for TypeScript resolution.
// The actual implementations are in:
// - zoom-surface.native.tsx (iOS/Android)
// - zoom-surface.web.tsx (Web, including Electron)
// Metro's platform-specific extensions will pick the right one at runtime.

export * from "./zoom-surface.native";
