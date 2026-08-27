## Learned User Preferences

- Wants a high-quality self-hosted background remover with both a web UI and an HTTP API other projects can call—not a thin wrapper around Photoroom, remove.bg, or similar vendor APIs.
- Prefers a durable $0 free-tier host that can actually run BiRefNet well; rejects paid host subscriptions for v1 and rejects free tiers too small to fit the model.
- Keep secrets out of chat; use GitHub Actions secrets or local env vars instead of pasting tokens.
- Document out-of-scope items clearly for each iteration.
- Prefer keeping the existing Oracle Always Free A1 instance (live resize, no terminate/recreate) and the systemd+nginx stack over Docker or rebuilds when capacity is scarce.

## Learned Workspace Facts

- Monorepo: `apps/api` (FastAPI + rembg `birefnet-general`) and `apps/web` (Next.js UI); root `docker-compose.yml` for local API.
- Uses MIT-licensed BiRefNet via rembg; RMBG-2.0 was avoided because of a non-commercial license.
- Browser uploads go directly to the API (not proxied through Vercel) so large images work on Vercel Hobby body limits.
- Auth: Bearer `API_KEYS` for API clients and short-lived UI JWTs sharing `UI_TOKEN_SECRET` between web and API; CORS via `WEB_ORIGIN`.
- Original free deploy target was Vercel Hobby (UI) + Hugging Face Docker Space CPU Basic 16GB; HF now requires Pro for free CPU Docker Spaces, so that Spaces path is blocked without Pro.
- Production API is Oracle Always Free Ampere A1.Flex (2 OCPU / 12GB) in `il-jerusalem-1` at `https://api.rembg.site`; Ubuntu aarch64 SSH user is `ubuntu` (not `opc`); BiRefNet needs ~8–12GB+ RAM so AWS Free Tier micros and small dynos OOM.
- On Oracle the API runs under systemd (`rembg.service`) behind nginx + Certbot—not Docker; code lives under `/opt/rembg/current`.
- OCI ephemeral public IPs survive stop/start and are released on terminate; converting to a reserved IP assigns a new address—reserve only if rebuilding, then update DNS.
- OCI ingress needs both the VCN security list and guest iptables open for 80/443; stock images often allow only SSH (22).
- GitHub Actions: CI, Vercel UI deploy, HF Space sync, and Oracle API deploy (`deploy-oracle.yml` rsync → restart `rembg`); Oracle needs `ORACLE_HOST`, `ORACLE_USER`, `ORACLE_SSH_KEY` plus shared API/UI secrets.
- Cold-start / first-inference clients should use ≥120s timeouts; health can report waking while the model loads.
