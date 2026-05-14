# PaperBanana Website MVP

This MVP turns PaperBanana into a BYOK web app:

- Customers paste their own OpenRouter, Gemini, OpenAI, or Alibaba Bailian API key.
- The frontend defaults to simple mode: customers choose one provider and paste one API key. Advanced mode exposes model names, pipeline, aspect ratio, candidate count, and backend address.
- Optional Better Auth login can be enabled through the auth gateway. In that mode, users register/sign in with email and password before generating images, and task history is filtered by user.
- API keys are injected only into the isolated generation subprocess and are not stored in SQLite.
- Task records, prompts, status, logs, and generated images are stored for product analysis.
- Admin task listing is protected with `ADMIN_TOKEN`.

## Local Backend

```bash
pip install -r requirements.txt
ADMIN_TOKEN=change-me PAPERBANANA_ALLOW_MOCK=1 uvicorn paperbanana_web.backend.app:app --host 0.0.0.0 --port 8080
```

Mock generation is disabled unless `PAPERBANANA_ALLOW_MOCK=1`.

## Local Frontend

```bash
cd web-client
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8080`.

To point the frontend at Laf instead of the local FastAPI backend:

```bash
cd web-client
VITE_BACKEND_MODE=laf VITE_API_BASE=https://sdswgya641.sealoshzh.site npm run build
```

When the frontend is hosted under the same Laf app/domain, `VITE_API_BASE` can be omitted and the app will call `/paperbanana-api`.

## GitHub Pages Frontend

This repository publishes the static frontend to GitHub Pages:

```bash
cd web-client
VITE_BACKEND_MODE=laf \
VITE_API_BASE=https://sdswgya641.sealoshzh.site \
VITE_BASE_PATH=/ \
npm run build
```

After the auth gateway is deployed, build the frontend against it:

```bash
cd web-client
VITE_AUTH_REQUIRED=true \
VITE_AUTH_BASE=https://api.paperbanana.asia \
VITE_BACKEND_MODE=gateway \
VITE_API_BASE=https://api.paperbanana.asia \
VITE_BASE_PATH=/ \
npm run build
```

The included GitHub Actions workflow `.github/workflows/deploy-pages.yml` builds `web-client` and deploys `web-client/dist` to GitHub Pages. In the GitHub repository, set Pages source to **GitHub Actions**.

The Laf cloud function must keep CORS enabled because GitHub Pages calls it from a different origin.

## Laf Cloud Function Deployment

The Laf backend is a single cloud function:

- local source: `laf/paperbanana-api.ts`
- function name: `paperbanana-api`
- current endpoint: `https://sdswgya641.sealoshzh.site/paperbanana-api`

Supported function actions:

- `health`: runtime check.
- `createJob`: create a BYOK generation task.
- `getJob`: fetch task status/result.
- `userJobs`: list tasks for a specific authenticated user. This is intended to be called by the auth gateway.
- `adminJobs`: list recent tasks when `ADMIN_TOKEN` is configured.
- `initDatabase`: create production indexes. If `ADMIN_TOKEN` is configured, the initializer also requires it.

Laf database collections:

- `paperbanana_jobs`: task metadata, user owner fields, configuration mode, prompts, infographic category, provider/model choices, status, logs, and image references.
- `paperbanana_images`: generated image bodies only when object storage is unavailable.
- `paperbanana_events`: lightweight usage events for later product analytics.

Run database initialization after deployment:

```bash
curl -X POST https://sdswgya641.sealoshzh.site/paperbanana-api \
  -H 'Content-Type: application/json' \
  -d '{"action":"initDatabase","adminToken":"YOUR_ADMIN_TOKEN_IF_CONFIGURED"}'
```

`adminJobs` still requires `ADMIN_TOKEN`; `initDatabase` can run before the admin token is configured so the database can be bootstrapped from a fresh Laf app.

The initializer creates these indexes:

- `paperbanana_jobs`: `createdAt_desc`, `status_updatedAt_desc`, `provider_createdAt_desc`, `userId_createdAt_desc`, `configurationMode_createdAt_desc`, `infographicCategory_createdAt_desc`.
- `paperbanana_images`: `job_candidate`, `createdAt_desc`.
- `paperbanana_events`: `createdAt_desc`, `type_createdAt_desc`, `provider_createdAt_desc`.

Supported BYOK providers:

- `openrouter`: text and image through OpenRouter.
- `gemini`: text and image through Google Gemini.
- `openai`: text through OpenAI chat completions and image through OpenAI image generation.
- `bailian`: text through DashScope OpenAI-compatible chat completions, image through Bailian Wanxiang.

Laf environment variables:

- `ADMIN_TOKEN`: optional admin token for the owner-facing task list.
- `PAPERBANANA_BUCKET`: optional bucket name for generated images, default `paperbanana`.
- `PAPERBANANA_MAX_CANDIDATES`: default `3`.
- `PAPERBANANA_MAX_CRITIC_ROUNDS`: default `2`.
- `PAPERBANANA_GATEWAY_TOKEN`: optional shared secret. When configured, user-facing job actions must come through the auth gateway.

If the configured bucket is missing or not writable, images fall back to `paperbanana_images` so the result is still saved. `paperbanana_jobs` stores only image references, and `getJob` hydrates the image data for the task owner. For production, create a Laf storage bucket and set `PAPERBANANA_BUCKET` to avoid large image blobs in MongoDB.

## Better Auth Gateway

The auth gateway is a Node/Express service:

- local source: `auth-gateway/`
- auth routes: `/api/auth/*`
- protected PaperBanana proxy: `/paperbanana-api`
- database: MongoDB via Better Auth MongoDB adapter.

Local run:

```bash
cd auth-gateway
npm install
cp .env.example .env
npm run dev
```

Required production environment variables:

- `AUTH_BASE_URL`: public gateway URL, for example `https://api.paperbanana.asia`.
- `FRONTEND_ORIGINS`: allowed frontend origins, for example `https://www.paperbanana.asia,https://paperbanana.asia`.
- `BETTER_AUTH_SECRET`: long random secret used by Better Auth.
- `MONGODB_URI`: MongoDB connection string used for Better Auth users, accounts, and sessions.
- `MONGODB_DB`: database name, default `paperbanana`.
- `LAF_API_URL`: existing Laf function endpoint.
- `PAPERBANANA_GATEWAY_TOKEN`: shared secret forwarded to Laf when direct public access should be disabled.

Production activation sequence:

1. Deploy `auth-gateway` to Sealos.
2. Point `api.paperbanana.asia` to the gateway.
3. Set the same `PAPERBANANA_GATEWAY_TOKEN` in both the gateway and Laf.
4. Rebuild GitHub Pages with `VITE_AUTH_REQUIRED=true`, `VITE_BACKEND_MODE=gateway`, and `VITE_API_BASE=https://api.paperbanana.asia`.

## Sealos Container Deployment

Build with:

```bash
docker build -f Dockerfile.web -t paperbanana-web .
```

Runtime environment variables:

- `ADMIN_TOKEN`: token for `/api/admin/jobs`.
- `PAPERBANANA_WEB_DATA_DIR`: persistent data directory, default `/app/paperbanana_web_data`.
- `PAPERBANANA_MAX_CANDIDATES`: default `4`.
- `PAPERBANANA_MAX_CRITIC_ROUNDS`: default `3`.
- `PAPERBANANA_JOB_TIMEOUT_SECONDS`: default `1800`.
- `PAPERBANANA_CORS_ORIGINS`: comma-separated origins, default `*`.

Mount `PAPERBANANA_WEB_DATA_DIR` to persistent storage in production.

## Privacy Boundary

The current MVP stores method text, caption, model choices, task logs, and generated images. It does not store API keys. Before public launch, add visible privacy copy explaining what is stored and why.
