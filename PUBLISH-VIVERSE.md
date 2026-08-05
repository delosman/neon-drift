# Publishing to VIVERSE

This fork is adapted for VIVERSE (WebGL) hosting. The two changes from upstream:

- `vite.config.ts` uses `base: './'` so the build works served from a subpath
  (VIVERSE hosts apps under a path, not at the domain root).
- `public/manifest.webmanifest` uses relative `start_url`/`scope` for the same reason.

## One-time setup

```bash
npm install -g @viverse/cli
viverse-cli auth login
```

## Publish

First publish (creates the app on VIVERSE and prints its App ID):

```bash
npm run build
viverse-cli app publish dist --auto-create-app --name "Kart Royale"
```

Subsequent updates (use the App ID from the first publish):

```bash
npm run build
viverse-cli app publish dist --app-id <your-app-id>
```

Or, once you know your App ID, put it in the `publish:viverse` script in
`package.json` and just run:

```bash
npm run publish:viverse
```

## Verify locally before publishing

```bash
npm run build
npm run preview
```

The production build is fully self-contained (~615 KB gzipped) — every mesh,
texture, and sound is generated in code at load time, so there are no external
assets to host and no CORS concerns.
