# JISHLink

Full-stack workforce staffing & manpower management system for JISHLink Consulting India Private Limited.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/jishlink run dev` — run the Expo app (web preview)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `JWT_SECRET`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Supabase (service role)
- Mobile/Web: Expo SDK 54 + Expo Router
- Auth: JWT (jsonwebtoken) + bcryptjs
- Email: Resend
- Validation: Zod + custom field validators (Aadhar Verhoeff, PAN regex, IFSC)
- Build: esbuild (API server CJS bundle)

## Where things live

- `artifacts/api-server/src/` — Express API routes
- `artifacts/api-server/supabase-schema.sql` — DB schema (run in Supabase dashboard)
- `artifacts/jishlink/app/` — Expo Router screens (auth/admin/recruiter/employee)
- `artifacts/jishlink/components/` — Shared UI components
- `artifacts/jishlink/context/AuthContext.tsx` — JWT auth context
- `artifacts/jishlink/lib/api.ts` — Central fetch client
- `artifacts/jishlink/constants/colors.ts` — JISHLink brand tokens
- `lib/api-spec/openapi.yaml` — Source of truth for API contract
- Google Form URL: https://docs.google.com/forms/d/e/1FAIpQLSc192PE19STVaivDDi6jEGKCa6_O6jrW0gxtR4oV5wSc3_OFw/viewform

## Architecture decisions

- Service role key is used server-side only; RLS is disabled since all access goes through the Express API with JWT auth
- JWT tokens are 7-day expiry; first-login password change is enforced on the client
- Recruiter screens re-export from admin screens where logic is identical (notifications)
- All Expo packages in devDependencies (Metro bundles everything statically)
- Reverse geocoding uses OSM Nominatim (free, no API key needed)

## Product

Three-role mobile/web workforce app:
- **Admin**: full employee CRUD, bulk Excel import, Google Form review queue (approve/reject with email), QR code for form link, recruiter oversight dashboard
- **Recruiter**: daily team attendance monitoring, absence note logging, workplace reassignment
- **Employee**: GPS clock-in/out, attendance history, notifications

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `supabase-schema.sql` in Supabase SQL Editor before the app can log in
- Default admin credentials: username=`admin`, password=`Admin@123` (change on first login)
- OpenAPI schema name `AuthLoginResponse` — do NOT rename back to `LoginResponse` (causes Orval type conflict)
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing openapi.yaml
- `expo-document-picker` must be `~14.0.8` and `expo-secure-store` must be `~15.0.8` for Expo SDK 54 compatibility
