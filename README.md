# REAA — Real Estate AI Assistant

WhatsApp assistant for California listing search, sold-market stats, similar-home recommendations, MLS-field Q&A, and human-approved email drafts.

IDX Exchange, Summer 2026.

## How a message flows

1. User sends WhatsApp text.
2. **OpenClaw** identifies the WhatsApp user and always runs one skill: `real-estate-selector` → `whatsapp_message`.
3. The TypeScript **orchestrator** (`src/index.ts`) classifies intent and may run **one or more** specialist agents in the same turn (mixed, for example search + market).
4. Agents run SQL/Python against MySQL. This is **not** LLM tool-calling. Semantic search exists in the repo but is **not** on the live WhatsApp path.
5. Short-term session state is merged **before** search SQL; `lastResults` are saved **after** search.
6. Replies are formatted for WhatsApp. Email is queued as a draft until `approve email <id>`.

```
WhatsApp
  → OpenClaw (real-estate-selector)
    → python3 src/runIndexAction.py whatsapp_message '<latest user text>'
      → src/whatsappHandler.ts → orchestrate()
        → Property Search | Market Stats | Recommendation | RAG | Email Draft
```

OpenClaw must pass the **latest user text character-for-character**. It must not rewrite the query or paste in city, price, or market clauses from earlier turns.

## Agents

| Agent | When it runs | Data |
|---|---|---|
| **Property Search** | `find` / `show` listings, or a filter follow-up like `4 baths only` | Active rows in `rets_property` |
| **Market Stats** | Rising/falling, weekly, market statistics, last N months | Solds in `california_sold` |
| **Recommendation** | `recommend similar comps` | Last listing in session vs other actives |
| **RAG Knowledge** | `what is` / `explain` / `meaning` (definition-style) | Indexed MLS columns + optional PDFs |
| **Email Draft** | `draft`/`send` + `email` + a recipient | One sourced agent, then Gmail on approve |

Identity: if asked its name, it replies **I'm REAA (Real Estate AI Assistant).**

## Search filters

Parsed in `src/parsePropertyQuery.ts` and merged with `src/userSessions.json`.

| Phrase | Effect |
|---|---|
| `in Los Angeles` | City (`LA`, `SD`, `SF`, `SJ`, … expand) |
| `under 900k` / `under 3M` | Max list price |
| `between 2M and 3M` | Min and max list price |
| `3 bedrooms` | Exact bed count |
| `4 bathrooms` | Baths **≥ 4** |
| `4 baths only` / `exactly 4 baths` | Baths **= 4** |
| `condo` / `townhome` / `single family` / `land` | Property type |
| `pool`, `view`, `no view`, `HOA under $500` | Extra flags |

Follow-ups reuse city and price from session. After a search, `4 baths only` is **search only** (it does not re-run market stats). `Recommend similar comps` is **recommendation only**, even if the word `homes` appears.

Beds/baths/price-only follow-ups still count as search so session memory works.

## Market Stats

`src/marketAnalytics.py` looks back from the latest sane close date (`CloseDate <= today`), not empty future calendar months. Periods with **0 sales are omitted**.

Useful prompts:

```
Tell me if prices are rising in Los Angeles over the last 6 months
weekly sales summary in Oakland over the last 8 weeks
Find homes in Los Angeles between 2M and 3M and give me market statistics there for the last 6 months
```

The first mixed example splits: search uses the 2M–3M band; market uses the LA 6-month **price trend**, not a statewide city snapshot.

The first row’s MoM/WoW can be N/A (no prior period). That is not an empty month.

## Recommendations

`Recommend similar comps` uses the **last listing in this chat**. It scores other **active** listings (newest 120, not the same address), sorts **highest similarity first**, and returns the top 5.

Score is out of **100**. Higher is more similar. It is **not** embeddings-only:

| Signal | Max points |
|---|---|
| Price within $50k / $150k / $300k | 20 / 12 / 5 |
| Same bed count | 15 |
| Same city | 15 |
| Sqft within 300 / 700 | 10 / 5 |
| Listing-text cosine × 40 | up to 40 |

The embedding text includes type, city, beds, baths, sqft, price, and remarks. Baths and type are **not** their own point buckets.

WhatsApp cards show address, price, beds/baths, sqft, and **score** only.

This step is slower than search: it embeds the target and each candidate via OpenAI.

## RAG

Definition questions (DOM, `ClosePrice`, column meaning) go to RAG, not Market Stats.

Corpus:

- Column lists for `rets_property` and `california_sold`
- Any `knowledge/*.pdf`

Build or refresh the index:

```bash
python3 src/ragKnowledge.py --query unused --build-index
```

The cache is `knowledge/rag_index.json` (gitignored). Avoid words like `market`, `prices`, `DOM`, or `days on market` in the question if you need it to stay on RAG.

## Email (human in the loop)

Nothing is sent until a second message. Templates:

| You say | Subject | Body source |
|---|---|---|
| `listing alert` | New Listing Alert | Property Search |
| `weekly` | Weekly Market Report | Market Stats weekly sales |
| `market report` (no weekly) | Market Report | Monthly price trend |
| `property summary` | Property Summary | Recommendation (needs a prior search) |
| `recommendation digest` | Personalized Recommendation Digest | Same recs |

```
Draft email to you@example.com with a weekly market report for Los Angeles
approve email d<id>
check draft
delete draft <id>
delete draft all
```

Recipient address is required. The body is **one** sourced agent, not the full WhatsApp thread.

## Session memory

Stored per WhatsApp user in `src/userSessions.json` (gitignored): city, min/max price, beds, baths, last listings, pending drafts.

There is **no** chat command to reset it. Deleting that JSON file only sticks after a bot restart. A new WhatsApp thread with the same number does not clear filters.

This is not long-term vector memory. RAG embeddings are for document Q&A and rec scoring, not user preferences across chats.

## Project layout

```
src/index.ts                 Orchestrator, intent, email draft flow
src/whatsappHandler.ts       WhatsApp formatting
src/parsePropertyQuery.ts    Natural-language filters
src/searchActiveListings.ts  Active listing SQL
src/marketAnalytics.py       Sold analytics
src/hybridRecommendation.py  Similar actives + score
src/ragKnowledge.py          RAG index + answers
src/emailAgent.ts            Gmail send after approve
src/chatbotScript.ts         Session load/save/merge
src/runIndexAction.py        CLI into Node orchestrator
skills/real-estate-selector/ OpenClaw skill (verbatim user text)
knowledge/                   Optional PDFs + rag_index.json
tests/                       Parser and orchestrator tests
```

## Setup

Needs **Node.js**, **Python 3**, MySQL, and an OpenAI key.

Repo `.env` (never commit):

```
MYSQL_HOST=
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=
OPENAI_API_KEY=
EMAIL_USER=
EMAIL_PASSWORD=
NODE_BINARY=
PYTHON_SITE_PACKAGES=
```

`EMAIL_PASSWORD` is a Gmail app password. `NODE_BINARY` and `PYTHON_SITE_PACKAGES` are optional if `node` / Python packages are not on PATH. Live OpenClaw channel/token config lives in `~/.openclaw/openclaw.json`, not this repo’s thinner `openclaw.json`.

Python packages used by the agents: `pandas`, `sqlalchemy`, `mysql-connector-python`, `openai`, `numpy`, and a PDF reader (`pypdf` or `PyPDF2`).

```bash
npm install
```

WhatsApp entry (what OpenClaw runs):

```bash
python3 "./src/runIndexAction.py" whatsapp_message 'Find 2 bedroom homes in Los Angeles under 900k'
```

Direct Node (JSON action), from repo root:

```bash
node --experimental-strip-types src/index.ts '{"action":"whatsapp_message","payload":{"query":"Find homes in Irvine under 2M","userId":"local"}}'
```

## Tests

```bash
node --test tests/parsePropertyQuery.test.ts tests/parseSoldPropertyQuery.test.ts tests/orchestrator.test.ts
```

## Demo questions (separate WhatsApp messages, same chat)

1. Find homes in Los Angeles between 2M and 3M and give me market statistics there for the last 6 months
2. 4 baths only
3. Recommend similar comps
4. Explain what comp means
5. Draft email to example@example.com with a weekly market report for Los Angeles

## Data notes

- Actives: `rets_property` (`L_Status = 'Active'`).
- Solds: `california_sold` (`PropertyType = 'Residential'`).
- Analytics ignore bogus future close dates by capping at `CURDATE()`.
- Search results are ordered by list price ascending (cheapest first in the band).
