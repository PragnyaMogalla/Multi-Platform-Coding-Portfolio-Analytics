# Candidate Signal — Coding Profile Dashboard

Same fair, cross-platform scoring as before, packed into fewer files.

```
candidate-dashboard/
├── README.md
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── index.html
    └── src/
        ├── App.jsx
        └── styles.css
```

`server.js` is organized top-to-bottom as **1. DATA NORMALIZATION → 2.
CANDIDATE ANALYZER → 3. SERVER**, matching the flow: profile links in →
normalize → analyze → score out. `App.jsx` is organized as **INPUT FORM →
FINAL CANDIDATE DASHBOARD → APP** (the piece that renders everything).

## Quick start

Needs Node.js 18+. Two terminals:

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev        # http://localhost:5050

# Terminal 2 — frontend
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open `http://localhost:5173`, paste a username or profile URL for any of the
four platforms (at least one required), click **Build dashboard**.

To change the backend port or the allowed frontend origin, edit the two
constants at the top of `backend/server.js` directly (no `.env` file needed).

## How the fairness scoring works

1. **Ratings become percentiles, not raw numbers** — a Codeforces 1800 and a
   LeetCode 1800 mean different things, so both convert to "percentile among
   that platform's rated users" first.
2. **Topic mastery uses MAX across platforms, not sum** — solving DP problems
   on two sites isn't double the skill, it's the same skill confirmed twice.
3. **Contest score is a confidence-weighted average of only the platforms the
   candidate has rated history on** — a missing platform is excluded from the
   denominator, never scored as zero.
4. **Problem volume is log-scaled** — diminishing returns on pure grinding.
5. **Every score ships with a data-confidence label** so you know how much to
   trust it.

## Known limitations

- **Codeforces** uses Codeforces' real public API — most reliable.
- **LeetCode** uses the unofficial GraphQL endpoint the site itself calls —
  can break if they change their schema.
- **CodeChef** and **HackerRank** have no public API, so both are scraped from
  public profile pages — most fragile. Either can degrade to `available:
  false` with a reason, without crashing the whole request.
- Percentile curves are hand-calibrated estimates, not live census data.

## API

`POST /api/analyze`
```json
{ "profiles": { "leetcode": "someuser", "codeforces": "https://codeforces.com/profile/tourist" } }
```
