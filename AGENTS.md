## Learned User Preferences

- Wants a high-quality self-hosted background remover with both a web UI and an HTTP API other projects can call—not a thin wrapper around Photoroom, remove.bg, or similar vendor APIs.
- Prefers a durable $0 free-tier host that can actually run BiRefNet well; rejects paid host subscriptions for v1 and rejects free tiers too small to fit the model.
- Keep secrets out of chat; use GitHub Actions secrets or local env vars instead of pasting tokens.
- Document out-of-scope items clearly for each iteration.

## Learned Workspace Facts

- Monorepo: `apps/api` (FastAPI + rembg `birefnet-general`) and `apps/web` (Next.js UI); root `docker-compose.yml` for local API.
- Uses MIT-licensed BiRefNet via rembg; RMBG-2.0 was avoided because of a non-commercial license.
- Browser uploads go directly to the API (not proxied through Vercel) so large images work on Vercel Hobby body limits.
- Auth: Bearer `API_KEYS` for API clients and short-lived UI JWTs sharing `UI_TOKEN_SECRET` between web and API; CORS via `WEB_ORIGIN`.
- Original free deploy target was Vercel Hobby (UI) + Hugging Face Docker Space CPU Basic 16GB (API on port 7860); HF now requires Pro for free CPU Docker Spaces, so that Spaces path is blocked without Pro.
- BiRefNet needs on the order of ~8–12GB+ RAM; AWS Free Tier micros (~1–2GB) and ~512MB free dynos will OOM; Oracle Always Free Ampere A1 (2 OCPU / 12GB) is the preferred $0 self-hosted API direction.
- GitHub Actions workflows cover CI, Vercel UI deploy, and HF Space sync; Space deploy needs `HF_TOKEN`, `HF_USERNAME`, and `HF_SPACE` secrets.
- Cold-start / first-inference clients should use ≥120s timeouts; health can report waking while the model loads.
