# Recording the demo video

These scripts record `docs/video-script.md` on the hosted demo with an automated browser, put captions and a
visible cursor into the page, cut out the waits and write an MP4. The output has captions and no voice; add
narration in a video editor if you want it.

They change the shared demo book (approve, pay, autopilot on, a new invoice), so reset it afterwards.

## Needs
- Node with Playwright and its Chromium (`npm i -g playwright && npx playwright install chromium`),
  or point `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH` at an existing install.
- Python 3 and `ffmpeg` (with libx264).
- `FXA_ACCESS_CODE` — the hosted demo's access code. It is never written to this repo; `prep.cjs` stores the unlocked
  session in `state.json`, which is git-ignored.

## Steps (run inside `docs/video/`)

```bash
export FXA_ACCESS_CODE=...      # from the Devpost testing instructions; never commit it
node prep.cjs --unlock-only    # save an unlocked session (state.json, git-ignored)
node reset.cjs                 # start the demo book over (the button waits 5 min after the last reset)
# wait ~3 minutes: the reset plans every currency in the background
node prep.cjs                  # run the Ask examples and the invoice comparison once, so they are cached
node record.cjs                # ~5 min; writes raw/*.webm
python3 edit.py fx-exposure-agent-demo.mp4 1.07   # cut the waits, 7% faster to stay under 3:00
node reset.cjs                 # clean up: autopilot off, fresh book
```

Devpost gallery images (3:2, 1500×1000, headline bar over a real screenshot) — on a fresh, pre-run book:

```bash
node gallery.cjs               # writes gallery/1-today.png … 7-evidence.png, then reset again
```

## How the cuts work
Playwright's video drifts several seconds against the script's clock over a five-minute take, so cut times are not
taken from the clock. Instead `record.cjs` paints a small square in the top-left corner while it waits — magenta from
the start of a wait, cyan at its end — and `edit.py` finds those frames and removes everything between them. The
square only appears inside removed parts.

## What to check in the result
- Every caption matches the screen under it (numbers are read from the page while recording).
- The payment is the app's "Simulate client payment" (captioned as simulated). A payment on PayPal's own invoice page
  needs a person logged in as the sandbox buyer — record that scene by hand if you want it.
- Length under 3:00.
