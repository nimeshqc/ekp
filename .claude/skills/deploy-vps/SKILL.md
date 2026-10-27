---
name: deploy-vps
description: Deploy this EKP checkout to the Hostinger production VPS via SSH, and diagnose live issues there. Use whenever the user asks to "deploy", "redeploy", "ship", "release", "push to prod/VPS", or reports a live-site problem (500s, blank page, admin login, expired link, ingestion failure) on ekp.revasyst.com.
---

# Deploy EKP to the Hostinger VPS

## Two repos. Get this right first.

Development and deployment are **different GitHub repos**. Pushing a release
to the wrong one deploys nothing; force-pushing across them destroys the
production files.

| | Repo / path | What happens there |
|---|---|---|
| Working tree | `nimeshqc/ekp` — the repo root you have open | Write code. Cut and push the release tag. Never run `deploy.sh`. Never `git remote add` the deploy repo here. |
| Deploy repo | `revasyst-projects/ekp-agent` | What the VPS clones. Owns `deploy.sh`, `docker-compose.prod.yml`, `docker-compose.revasyst.yml`, `nginx/nginx.plain.conf` — these exist in **no other repo**. |
| VPS checkout | `/opt/revasyst/ekp` on `200.234.47.204` | The only place `bash deploy.sh` runs. It hard-resets to `origin/main`. |

Both repos are public; the VPS fetches anonymously over HTTPS. There is no
deploy key and no token that can expire.

Human runbook: `docs/deploy.md`.

## Stack this checkout ships

Compose project `ekp`, file `docker-compose.prod.yml`, env `/opt/revasyst/ekp/.env`
(VPS only, never commit it).

- Containers: `ekp-api-1`, `ekp-nginx-1`, `ekp-postgres-1`
- Volumes: `ekp_pgdata` and `ekp_model_cache` (the ONNX embedder — losing it adds minutes to every boot)
- Edge: Traefik on Docker network `revasyst` routes `ekp.revasyst.com` to `ekp-nginx-1`. **This stack publishes no host ports.** Do not bind 80, 443, 5432 or 8000.
- Schema: no Alembic. `backend/app/schema.sql` is idempotent and the API applies it on startup, so a deploy migrates itself. Keep every schema change additive.
- Embeddings run in-process (`BAAI/bge-small-en-v1.5`, onnx-int8). Generation is Gemini via `GEMINI_API_KEY` in `.env`.

Leave these alone on the same box: Traefik (`revasyst`), `crmflow-*`,
`revasyst-*`, `postbuilder-*`, `taskflow-mcp-*`, `infra-db-1`,
`portfolio-monitor-proxy-1`.

## Deploy

1. Ask for the version if the user did not name one. Confirm `main` here is
   merged and up to date.
2. Tag on `nimeshqc/ekp`: `git tag -a <tag> -m "…" && git push origin <tag>`.
3. **Merge the release into `ekp-agent`**, in a scratch clone so this
   checkout's remotes are untouched:

```bash
cd "$(mktemp -d)" && git clone git@github.com:revasyst-projects/ekp-agent.git && cd ekp-agent
git fetch <path-to-this-working-tree> main
git merge --no-edit FETCH_HEAD -m "Merge <tag>"
ls deploy.sh docker-compose.prod.yml nginx/nginx.plain.conf   # must all still exist
git push origin main
git tag -a <tag> -m "<tag>" && git push origin <tag>
```

   The repos touch disjoint files, so a conflict means something is wrong —
   stop and look rather than resolving blind. Keep `ekp-agent`'s copy of the
   four production files; take the application side for everything else.

4. On the VPS only:

```bash
ssh -i ~/.ssh/id_hostinger_vps root@200.234.47.204 "cd /opt/revasyst/ekp && bash deploy.sh"
```

Run it in the background — the build takes minutes (npm ci + vite, then pip
install). `deploy.sh` exits early if `.env`, `config.yaml` or the `revasyst`
network is missing; do not create a substitute network.

**`deploy.sh` ships a branch, not a tag.** `DEPLOY_BRANCH` defaults to `main`
and the script runs `git reset --hard origin/$BRANCH`, so a tag name fails
there. The tag is for the record and for rollback; `main` is what ships. Tag
the commit you just pushed so the two agree.

`~/.ssh/config` has a stale `crmflow-vps` entry pointing at `72.60.101.33`,
which times out. The live host is `200.234.47.204`. Use the IP.

## Verify — all four, every time

```bash
ssh root@200.234.47.204 "cd /opt/revasyst/ekp && git log --oneline -1 && git describe --tags"
ssh root@200.234.47.204 "docker compose -f docker-compose.prod.yml --env-file .env ps"
ssh root@200.234.47.204 "docker exec ekp-nginx-1 wget -qO- http://api:8000/api/health"
curl -sS https://ekp.revasyst.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)'
```

The asset hashes must match a local `npm run build`. A `200` from the site
proves Traefik and nginx are up, **not** that your frontend shipped — only the
hashes do. If a schema change went out, confirm it landed:

```bash
ssh root@200.234.47.204 "docker exec ekp-postgres-1 psql -U ekp -d ekp -c '\\d query_log'"
```

Smoke-test the API read-only from inside the network; do not create links or
run queries against production to prove a deploy worked.

## When production is wrong

- **Blank page or stale UI**: the asset hashes did not change. The nginx image
  did not rebuild — re-run `deploy.sh` and read its build output rather than
  restarting the container.
- **API 500s on admin pages**: a column the code expects is missing. Compare
  `\d <table>` on `ekp-postgres-1` with `backend/app/schema.sql`. Repair with
  an additive `ALTER TABLE`; the startup path will keep it.
- **Slow first answer after a deploy**: the embedder is reloading. Check
  `docker logs ekp-api-1` for `embedder … loaded in`. If it downloads the
  model every boot, volume `ekp_model_cache` was lost.
- **Sourcing `.env` in a shell gives wrong credentials**: that file has CRLF
  line endings, so every value picks up a trailing `\r`. Use
  `eval "$(tr -d '\r' < .env | grep -E '^ADMIN_' | sed 's/^/export /')"`.
  The app itself is unaffected.
- Traefik is shared. If `ekp.revasyst.com` 404s while containers are healthy,
  check `ekp-nginx-1` is still on both `ekp_default` and `revasyst`.

## Do not

- Run `deploy.sh`, or `make up`, in the local working tree.
- `git remote add` the deploy repo to this checkout — merge from a scratch
  clone instead.
- Force-push between `nimeshqc/ekp` and `revasyst-projects/ekp-agent` in
  either direction.
- Use the root `docker-compose.yml` on the VPS — it binds 80/443 and fights
  Traefik. Always pass `-f docker-compose.prod.yml`.
- `docker compose down -v`, `DROP`, or `TRUNCATE` against `ekp-postgres-1`
  without an explicit yes. Proposal links, their conversations and the
  uploaded corpora all live there.
- Touch another project's containers, volumes or the `revasyst` network.
