# PaperBanana Website MVP

This MVP turns PaperBanana into a BYOK web app:

- Customers paste their own OpenRouter, Gemini, or OpenAI API key.
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

This repository can publish only the static frontend to GitHub Pages while Laf remains the backend:

```bash
cd web-client
VITE_BACKEND_MODE=laf \
VITE_API_BASE=https://sdswgya641.sealoshzh.site \
VITE_BASE_PATH=/PaperBanana-web/ \
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
- `adminJobs`: list recent tasks when `ADMIN_TOKEN` is configured.

Laf environment variables:

- `ADMIN_TOKEN`: optional admin token for the owner-facing task list.
- `PAPERBANANA_BUCKET`: optional bucket name for generated images, default `paperbanana`.
- `PAPERBANANA_MAX_CANDIDATES`: default `3`.
- `PAPERBANANA_MAX_CRITIC_ROUNDS`: default `2`.

If the configured bucket is missing or not writable, images fall back to database `data:` URLs so the result is still saved. For production, create a Laf storage bucket and set `PAPERBANANA_BUCKET` to avoid large image blobs in MongoDB records.

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
