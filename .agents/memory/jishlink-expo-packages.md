---
name: JISHLink Expo package placement
description: All Expo/RN packages must be in devDependencies — dependencies{} must be empty
---

For the `@workspace/jishlink` Expo artifact, **all packages must go in `devDependencies`**. The `dependencies` object must remain empty `{}`.

**Why:** Metro bundles everything statically at build time. Packages in `dependencies` can end up in a separate `node_modules` location that Metro's resolver doesn't find, causing "Unable to resolve module" errors at runtime even though the package is physically installed.

**How to apply:** When adding any new package to the Expo app (Expo SDK packages, RN libs, fonts, utilities), always use `devDependencies`. Never add anything to `dependencies`.

Also: `expo-document-picker` must be `~14.0.8` and `expo-secure-store` must be `~15.0.8` for Expo SDK 54 compatibility.
