---
name: "stuck-process-recovery"
description: "Stuck exec session or input-wait: inspect, feed stdin, or kill and rerun."
---

Use when an exec/tool run returns still running, no output, or input-wait.
1. Run once.
2. If it stays running, call process list.
3. If status is input-wait, treat it as awaiting stdin; use write, send-keys, submit, or paste to supply the needed input.
4. If there is no input to supply or the run is wedged, kill the session, then rerun with a simpler/clearer invocation.
5. Do not burn retries on blind polls or repeated identical exec calls.
Pitfalls: long quiet runs can be waiting for input, and log reads may stay empty until input is sent.
Verify by one of: the session exits cleanly, process list no longer shows running/input-wait, or the command prints the expected result after input is sent.
