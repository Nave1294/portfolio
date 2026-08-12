# Architecture Portfolio — Evan Thalheimer

Live at **https://nave1294.github.io/portfolio/**

A generated static site. Content lives in `content/`; `build.mjs` turns it into
`dist/`. Pushing to `main` builds and deploys automatically.

## Build and preview locally

```bash
node build.mjs
```

```bash
python -m http.server 8765 --directory dist
```

## Editing content

Everything is in `content/settings.json` and `content/projects/*.json`.
See [CONVENTIONS.md](CONVENTIONS.md) for what each field does, how the landing
page toggle works, and how to add or hide a project.

No HTML editing — `dist/` is generated output and is not committed.
