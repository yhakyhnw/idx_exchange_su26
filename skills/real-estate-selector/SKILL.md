---
name: real-estate-selector
description: Route real-estate requests to orchestrator.
---

Skill Selector:

This skill is only used for in-scope real-estate requests. Do not refuse here.

1. Run exactly one command:
   `python3 "./src/runIndexAction.py" whatsapp_message '<user query>'`
   Use the latest user WhatsApp text character-for-character. Do not rewrite it, and do not add city, price, beds, baths, market, or other clauses from earlier turns.
2. Tool output is not delivered to the user. After the command returns, send a normal assistant text message whose entire body is the command stdout.
3. Never reply with `NO_REPLY`, `HEARTBEAT_OK`, an empty message, or an out-of-scope refusal. Those tokens suppress delivery and look like a failed run.
