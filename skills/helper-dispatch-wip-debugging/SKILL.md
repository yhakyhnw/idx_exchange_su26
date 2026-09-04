---
name: "helper-dispatch-wip-debugging"
description: "Helper script returns WIP or wrong action: inspect dispatch contract, then rerun with the exact routed action/query split."
---

When a wrapper returns WIP, unknown action, or a default branch, use this.

1. Inspect the wrapper contract first.
   - Check which argv/JSON field becomes `action` and which becomes `query`.
   - Check whether the downstream code switches on exact action names.

2. Inspect the parser/dispatcher for accepted values.
   - Read the switch/if chain and any regex parser for the exact spellings.
   - Do not assume a natural-language phrase belongs in the action field.

3. Rerun with contract-compliant inputs.
   - Put the routed command name in the action field.
   - Put user text only where the downstream parser expects query text.

4. If a search tool is missing, switch immediately.
   - Use grep, sed, or direct file reads instead of retrying the missing tool.

Pitfalls:
- Passing a human phrase as action when the wrapper expects a fixed action key.
- Assuming a default/WIP response means the task is still running.
- Burning a round trip on an unavailable search tool.

Verify:
- The rerun reaches a non-default branch and returns the specific success body for the intended action, not WIP/default.
