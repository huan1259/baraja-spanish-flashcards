# Baraja

A flashcard app for learning Spanish vocabulary, organized by CEFR reading
level (A1–B2). Tap a card to flip it; swipe **right** when you know a word to
move it toward Learned → Memorized, or **left** to keep it in rotation.
Progress saves automatically in your browser.

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

## Build for production

```bash
npm run build      # outputs a static site to dist/
npm run preview    # serves the built site locally to check it
```

## Deploy

The build is a plain static site (the `dist/` folder), so any static host works.

- **Vercel / Netlify (easiest):** sign in with GitHub, import this repo. Vite is
  auto-detected — build command `npm run build`, output directory `dist`. Deploy.
- **GitHub Pages:** set `base: "/baraja/"` in `vite.config.js` (match your repo
  name), then publish `dist/` (e.g. with a Pages Action or the `gh-pages` package).

## Project layout

```
src/Baraja.jsx    the whole app (UI, swipe/flip logic, localStorage persistence)
src/decks.json    the vocabulary the app loads
data/             the pipeline that builds the decks (see below)
```

## Regenerating / expanding the decks

The decks are built from the open [doozan/spanish_data](https://github.com/doozan/spanish_data)
dataset. To rebuild or grow them:

```bash
git clone https://github.com/doozan/spanish_data.git
# adjust the paths and per-level POS quotas at the top of data/build_all.py
python3 data/build_all.py
```

Then re-interleave the level files into `src/decks.json`.

## Attribution & licensing

The vocabulary data is derived from open sources and carries their terms:

- Word meanings: **Wiktionary** (CC BY-SA)
- Example sentences: **Tatoeba** (CC BY 2.0 FR)
- Word frequency: **hermitdave/FrequencyWords** (CC BY-SA 3.0)

Because of the ShareAlike terms, the vocabulary data in this project is
distributed under **CC BY-SA** with attribution to the sources above. The
application code is yours to license as you wish.
