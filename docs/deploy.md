# EKP — Hostinger VPS deployment

Runbook for shipping this repo to `https://ekp.revasyst.com` on the Hostinger
VPS `200.234.47.204` (host `srv1971159`, VPS 1971159).

Agent checklist: [`.claude/skills/deploy-vps/SKILL.md`](../.claude/skills/deploy-vps/SKILL.md).

## Two repos, and why

This is the part that catches people out. Development and deployment live in
different GitHub repos:

| Repo | Role |
|---|---|
| `nimeshqc/ekp` | Where features are written. PRs and release tags are cut here. Has **no** production files. |
| `revasyst-projects/ekp-agent` | What the VPS clones. Carries `deploy.sh`, `docker-compose.prod.yml`, `docker-compose.revasyst.yml` and `nginx/nginx.plain.conf`, which exist nowhere else. |

The two share history back to `2498a1a`, then diverge: `ekp-agent` added the
production files, `nimeshqc/ekp` carries the application work. A release has
to be **merged across**, never force-pushed either way, or the production
files are lost.

Both repos are public, so the VPS fetches over anonymous HTTPS. There is no
deploy key and no token to expire.

| Directory | Role |
|---|---|
| This working tree | Write code. Cut the tag. Merge into `ekp-agent`. Never run `deploy.sh` here. |
| `/opt/revasyst/ekp` on the VPS | The only place `deploy.sh` runs. It hard-resets to `origin/main`. |

## What runs

Compose project `ekp`, file `docker-compose.prod.yml`, env `/opt/revasyst/ekp/.env`
(on the VPS only, never committed).

| Service | Container | Role |
|---|---|---|
| `postgres` | `ekp-postgres-1` | `pgvector/pgvector:pg16`, volume `ekp_pgdata`, no host port |
| `api` | `ekp-api-1` | uvicorn on 8000. Applies `backend/app/schema.sql` on startup |
| `nginx` | `ekp-nginx-1` | Builds `frontend/` (vite → nginx), serves the SPA, proxies `/api` |

Volume `ekp_model_cache` keeps the ONNX embedding model across restarts — the
API takes ~11 s to boot with it warm, much longer without.

Traefik (compose project `revasyst`) owns host ports 80 and 443 and routes
`ekp.revasyst.com` to `ekp-nginx-1` over the external Docker network
`revasyst`. **This stack publishes nothing on the host.** The router labels are
in `docker-compose.prod.yml`.

The root `docker-compose.yml` is for local development — it binds 80/443 and
would collide with Traefik. Never use it on the VPS.

Other stacks share this box: `crmflow-*`, `revasyst-*`, `postbuilder-*`,
`taskflow-mcp-*`, `infra-db-1`, `portfolio-monitor-proxy-1`. Leave them alone.

## Schema

There is no Alembic. `backend/app/schema.sql` is idempotent — `CREATE TABLE IF
NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — and the API applies it
on every startup. A deploy therefore migrates itself, and a schema change must
stay additive. `make migrate` runs the same thing by hand.

## Release and deploy

### 1. Cut the release on `nimeshqc/ekp`

```bash
# in this working tree, on an up-to-date main
git tag -a v1.2.0 -m "v1.2.0 — <what changed>"
git push origin v1.2.0
```

### 2. Merge the release into `ekp-agent`

Do this in a scratch clone so this checkout's remotes stay pointed at
`nimeshqc/ekp`:

```bash
cd "$(mktemp -d)"
git clone git@github.com:revasyst-projects/ekp-agent.git
cd ekp-agent
git fetch /home/nims/work/ekp main
git merge --no-edit FETCH_HEAD -m "Merge v1.2.0"
# sanity: the production files must still be here
ls deploy.sh docker-compose.prod.yml nginx/nginx.plain.conf
git push origin main
git tag -a v1.2.0 -m "v1.2.0" && git push origin v1.2.0
```

Conflicts should not happen — the two repos touch disjoint files. If one
appears, keep `ekp-agent`'s version of the four production files and take the
application side for everything else.

### 3. Deploy

```bash
ssh -i ~/.ssh/id_hostinger_vps root@200.234.47.204 \
  "cd /opt/revasyst/ekp && bash deploy.sh"
```

`deploy.sh` fetches, `git reset --hard origin/main`, rebuilds both images,
recreates `api` and `nginx`, and prunes dangling images. It refuses to run if
`.env`, `config.yaml` or the `revasyst` network is missing.

**`deploy.sh` deploys a branch, not a tag.** `DEPLOY_BRANCH` defaults to
`main`; passing a tag name fails at `git reset --hard origin/<tag>`. The tag is
for the record and for rollback — what actually ships is whatever `main` points
at. Keep the two in step by tagging the commit you just pushed.

The build takes a few minutes (npm install + vite build, then pip install).
`nginx` is recreated, so there is a brief gap on the public URL. Nothing
drains connections.

## Verify

```bash
# deployed commit matches the tag
ssh root@200.234.47.204 "cd /opt/revasyst/ekp && git log --oneline -1 && git describe --tags"

# api answers inside the network (no host port to curl)
ssh root@200.234.47.204 "docker exec ekp-nginx-1 wget -qO- http://api:8000/api/health"

# the public site, and that it serves the bundle you just built
curl -sS -o /dev/null -w '%{http_code}\n' https://ekp.revasyst.com/
curl -sS https://ekp.revasyst.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)'
```

Compare those asset hashes against a local `npm run build` — identical hashes
prove the new frontend is live, which a `200` alone does not.

Logs:

```bash
ssh root@200.234.47.204 "cd /opt/revasyst/ekp && \
  docker compose -f docker-compose.prod.yml --env-file .env logs --tail 100 api nginx"
```

## Rollback

```bash
ssh root@200.234.47.204 "cd /opt/revasyst/ekp && \
  git reset --hard <previous-sha> && \
  docker compose -f docker-compose.prod.yml --env-file .env up -d --build"
```

Additive schema from the newer release stays behind. That is harmless to older
code, which simply ignores the extra tables and columns.

## Gotchas

- **`/opt/revasyst/ekp/.env` has CRLF line endings.** Docker's `env_file` and
  pydantic both cope, but `set -a; . ./.env` in a shell appends `\r` to every
  value and silently breaks credentials. Strip them first:
  `eval "$(tr -d '\r' < .env | grep -E '^ADMIN_' | sed 's/^/export /')"`.
- Compose warns that `ekp_pgdata` and `ekp_model_cache` "already exist but
  were not created by Docker Compose". They predate the current compose file.
  Harmless — do not try to recreate them.
- `make up` and the root `docker-compose.yml` bind host 80/443. On the VPS
  that fights Traefik. Always pass `-f docker-compose.prod.yml`.
