# Keele Runs — preview build

Route-discovery website for runners around York University's Keele campus, Toronto.
First slice: everything a runner can do **without an account**.

Requirements, decisions, and the route template live in a separate planning repo,
`agent-project-foundry`, under `projects/york-running-routes/`.

## Run it

From this folder:

```
python -m http.server 8765
```

Then open <http://localhost:8765>.

Opening `index.html` straight from the file system will not work — the browser blocks
`fetch` on `file://`, so the routes never load. Use the local server.

Your location only works over `https://` or `localhost`. `localhost` counts as secure,
so the "Show where I am" button works in local development.

## What is built

| Requirement | State |
| --- | --- |
| REQ-001, 002 Find routes around the Keele campus, open to anyone | done |
| REQ-003, 016 A prepared set of routes | placeholder data, 6 routes |
| REQ-005 Choose by distance or time | done |
| REQ-006 Choose by terrain and surface | done |
| REQ-007 Choose by lighting and traffic | done |
| REQ-008 Choose by scenery | done |
| REQ-009 Website, phone first | done |
| REQ-010 Plan beforehand: map, description, choose | done |
| REQ-011 See where you are along the route | done, needs a real device to confirm |
| REQ-012 Usable without an account | done — there are no accounts at all |
| REQ-017 Assumes a phone signal | as designed |
| REQ-018 Own photographs | placeholders in place, photos pending |
| REQ-004 Later runner submissions | routes live in one JSON file, nothing hard-codes them |
| REQ-013 Save favourites | on this device only, no sign-in |
| REQ-014, 015 Mark a run done, see your history | on this device only, no sign-in |
| Sign-in, and favourites that follow you between devices | **not built** — needs Firebase Auth and a database |

## What is deliberately missing

- **Accounts.** Favourites and run history are kept in the browser on one device. They do
  not follow a runner to another phone or laptop, and clearing browser data erases them.
  Making them portable needs Firebase Auth and a database — see `runbooks/firebase-setup.md`
  in the planning repo.
- **Real routes.** Everything in `data/routes.json` is unverified desk research. Distances,
  surfaces, lighting and the drawn lines are illustrative. Replace them with ground-checked
  values and real GPS traces.
- **Photos.** Every route shows a plain placeholder panel. Never substitute a stock photo of
  somewhere else — see the route template in the planning repo.

## Adding a real route

Edit `data/routes.json`. Nothing else needs touching — the list, filters, and map all read
from it. Follow the field list in `route-template.md` in the planning repo (`agent-project-foundry/projects/york-running-routes/content/`), and:

- `path` is `[longitude, latitude]` pairs, **longitude first**. Export a GPS trace and thin it
  to a few dozen points.
- Set `"verified": true` once you have run it, which removes the "not yet checked" badge.
- Set `lighting.checked` to the date you looked, in `YYYY-MM-DD`.
- Add photos as `{"src": "photos/name.jpg", "alt": "what it shows"}`.

## Decisions this build follows

- **Map:** OpenFreeMap vector tiles, no API key, no registration. Swappable in one constant
  at the top of `app.js` if it ever needs to become self-hosted Protomaps.
- **Attribution:** the OpenFreeMap style embeds none of its own, so the required
  *OpenMapTiles · Data from OpenStreetMap* credit is added explicitly to the map control and
  repeated in the page footer.
- **Location:** read only when the runner presses the button, after the consent sentence,
  never stored and never sent anywhere. Refusing costs nothing but the moving dot.
- **No tracking:** no analytics, no cookies, no local storage, no third-party scripts beyond
  the map library itself.

## Known gaps

- MapLibre loads from a CDN. Fine for a preview; pin and self-host it before going public.
- Not yet opened on a real phone. The layout is phone-first but unproven on hardware.
- No automated tests in this folder. Filter logic was verified against the real data during
  the build; that check lives outside the repo.
