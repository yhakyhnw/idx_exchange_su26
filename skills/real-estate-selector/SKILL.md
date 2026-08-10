---
name: real-estate-selector
description: Route real-estate requests to the right selector branch.
---

Skill Selector:

1. Any user query related to property search:
  1. If query includes sold intent (sold, closed, comp, comparable), run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" search_sold_properties "<user query>"`
  2. Otherwise run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" search_active_properties "<user query>"`
  3. Reply with exact stdout only (no extra words, no bullets, no summary, no formatting changes)
2. Any user query related to market analytics:
  1. Reply "WIP"
3. Any user query related to semantic recommendations:
  1. Reply "WIP"
4. Any user query related to RAG knowledge retrieval:
  1. Reply "WIP"
5. Any user query related to WhatsApp/email communication:
  1. Reply "WIP"
6. Any future real-estate function:
  1. Run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" <future_action_name> "<user query>"`
  2. Reply with exact stdout only (no extra words)

