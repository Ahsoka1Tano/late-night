# Late Night publishing

Before the final browser check and publishing, run `node scripts/refresh-assets.cjs`.
Commit its changes to `index.html` alongside the updated assets. This prevents a
fresh HTML page from using cached styles or scripts from a previous evening.

Keep the user's existing Git author configuration. Never add assistant attribution
or a `Co-authored-by` trailer. Keep the app simple and follow the current roadmap.
