---
name: JISHLink Orval naming conflict
description: Why AuthLoginResponse must not be renamed back to LoginResponse in the OpenAPI spec
---

The OpenAPI schema for the login response must be named `AuthLoginResponse`, NOT `LoginResponse`.

**Why:** Orval generates both a Zod validator (`loginResponse` in `api.ts`) AND a TypeScript type (`LoginResponse` in `generated/types/loginResponse.ts`). When both are re-exported from the barrel `index.ts`, there is a duplicate identifier conflict that breaks compilation.

**How to apply:** Any time openapi.yaml is edited, keep `AuthLoginResponse` as the schema name for the `/auth/login` 200 response. If codegen breaks with a "duplicate identifier" error, this is the first thing to check.
