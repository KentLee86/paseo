// This file exists for TypeScript resolution.
// The actual implementations are in:
// - modal-gesture-root.native.tsx (iOS/Android)
// - modal-gesture-root.web.tsx (Web, including Electron)
// Metro's platform-specific extensions will pick the right one at runtime.

export * from "./modal-gesture-root.native";
