# Deploying the BRS Tee-Time Sniper

The app ships as a standalone Next.js Docker image (`output: 'standalone'`, see
`Dockerfile`) and is hosted as a **Coolify** application.

## Target host

- **Coolify VPS:** `root@88.99.211.189` (Hetzner, Ubuntu 24.04, Coolify + Traefik,
  Let's Encrypt).
- Coolify builds the `Dockerfile`, runs the container, and fronts it with Traefik
  (TLS + routing).

## One-time setup

1. **Create the app** in Coolify from this git repo. Build pack = **Dockerfile**
   (repo root). Coolify builds the multi-stage image and runs `node server.js`
   on port **3000** (the runner stage sets `PORT=3000 HOSTNAME=0.0.0.0`).

2. **Provision Postgres** as a Coolify **database** resource (not a manual
   container). Coolify gives an internal connection string — use it verbatim as
   `DATABASE_URL`. This is the same URL contract as local dev
   (`postgresql://brs:brs@localhost:5432/brs` via `npm run db:dev`); only the host
   /credentials differ. Nothing in the app changes between environments.

3. **Set environment variables** (Coolify → app → Environment). See
   `.env.example` for the full list:
   - `DATABASE_URL` — from the Coolify Postgres resource.
   - `BRS_VAULT_KEY` — `openssl rand -base64 32`. **Generate a fresh one for prod.**
     This key decrypts every stored BRS password.
     ⚠️ **Back it up separately from the database.** If the DB and the key ever
     share a backup and that backup leaks, the vault is defeated; if the key is
     lost, all stored BRS credentials become unrecoverable.
   - `APP_ORIGIN` — the public origin, e.g. `https://sniper.example.com`.
   - `RESEND_API_KEY`, `SMS_ENDPOINT`, `SMS_SENDER` — optional until Phase 6.

4. **Domain / TLS.** Set the app's FQDN in Coolify and let Traefik obtain the
   Let's Encrypt cert. ⚠️ If the router/cert does **not** provision from the FQDN
   alone, the app's `applications.custom_labels` is overriding the generated
   Traefik labels — append the new domain's router labels (mirror an existing
   index) and redeploy. See the memory note
   *"Coolify: add a domain to an app (custom_labels)"*.

## Deploys

- Push to the deploy branch → Coolify rebuilds the image and redeploys. Runtime
  env is injected by Coolify; no secrets live in the image (`.env` is
  `.dockerignore`d).

## Phase 1 follow-up (when the Prisma schema gains models)

- Add `npx prisma generate` to the **builder** stage of the `Dockerfile`.
- Run `npx prisma migrate deploy` as the Coolify **pre-deploy / release** command
  so schema migrations apply before the new container serves traffic.

## Moving to the UK colo later

The eventual move off Hetzner to a UK colocation box is just a **redeploy**:
stand up Coolify on the new host, recreate the app + Postgres resource, restore
the DB dump, set the **same** `BRS_VAULT_KEY`, and point DNS at the new box. No
application code changes.
