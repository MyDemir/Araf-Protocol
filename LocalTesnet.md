# LocalTesnet

## Codespaces CORS note — do not forget

When running the local test flow from GitHub Codespaces, the frontend and backend are exposed on different public preview origins, for example:

- Frontend: `https://<codespace>-5173.app.github.dev`
- Backend: `https://<codespace>-4000.app.github.dev`

Because these are different origins, local testing can hit browser CORS errors such as:

- `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- `Failed to fetch`
- `ERR_FAILED 404` after blocked cross-origin requests

### Temporary local testing fix

A development-only CORS relaxation may be needed so Codespaces preview URLs can talk to each other during local/mobile testing.

This kind of workaround is acceptable only for local/Codespaces development.

### Important mainnet / production warning

Do **not** carry a permissive CORS workaround into production.

Examples of unsafe production patterns:

- `origin: true` for all requests
- reflecting arbitrary origins while also using `credentials: true`
- treating Codespaces preview origins as trusted production origins

For production/mainnet deployments:

- keep CORS restricted to explicit `ALLOWED_ORIGINS`
- allow only the real frontend domain(s)
- never use a broad development CORS rule as a production setting

### Rule to remember

- Local/Codespaces: flexible CORS may be used temporarily if required for testing
- Mainnet/production: strict whitelist only

This note exists so the temporary local Codespaces fix is not forgotten and is never mistaken for a safe mainnet configuration.
