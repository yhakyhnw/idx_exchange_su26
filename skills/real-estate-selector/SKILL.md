---
name: real-estate-selector
description: Route real-estate requests to the right selector branch.
---

Skill Selector:

Global execution guard (applies to every branch):
- Run exactly one command for the selected branch.
- Do not run any setup/debug/repair commands.
- Never edit/create/delete/rename files.
- If the command errors, return exact stdout/stderr only and stop.

1. Any user query related to market analytics, including:
  - Average and median close price by city, ZIP, or property type
  - Price per square foot trends over time
  - List-to-close price ratio (negotiation leverage indicator)
  - Average days on market by city and month
  - Inventory comparison: rets_property active count vs. california_sold volume
  - Month-over-month and year-over-year trend comparisons
  - Trigger keywords/examples: average, median, trend, price per sq ft, list-to-close, days on market, inventory, MoM, YoY, "good time to buy"
  1. Run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" market_analytics "<user query>"`
  2. Reply with exact stdout only (no extra words)
2. Any user query related to property search:
  1. This branch applies only when the query is asking for listings/properties/homes to show or find.
  2. If query includes sold intent (sold, closed, comp, comparable), run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" search_sold_properties "<user query>"`
  3. Otherwise run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" search_active_properties "<user query>"`
  4. Reply with exact stdout only (no extra words, no bullets, no summary, no formatting changes)
3. Any user query related to semantic recommendations:
  1. Run `python3 "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/src/runIndexAction.py" semantic_search_properties "<user query>"`
  2. Reply with exact stdout only (no extra words)
4. Any user query related to RAG knowledge retrieval:
  1. Reply "WIP 4"
5. Any user query related to WhatsApp/email communication:
  1. Reply "WIP 5"

