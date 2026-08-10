---
name: "debug-hung-exec-commands"
description: "Exec says still running or hangs: inspect child process, logs, and real exit cause."
---

# When to use
Use when `exec`/process output says a command is still running, hangs, or returns no output after repeated polls.

# Procedure
1. Stop blind polling after the first stall signal.
2. Get the wrapper PID and child PID.
   - Use `process list` / `process poll` if you have a session id.
   - Use `ps -p <wrapper_pid> -f` and `pgrep -P <wrapper_pid> -af .` to see the child.
3. Check the session log early.
   - Look for the first real stderr/stdout line, not shell wrapper noise.
4. Classify the stall.
   - If the child already exited with an error, fix the underlying args/input and rerun once.
   - If the wrapper is waiting for input, send input or stop the session before starting a duplicate.
5. Avoid duplicate retries while the same wrapper/child pair is still alive.

# Pitfalls
- `exec` can report “Command still running” even when the inner process has already failed.
- Polling alone often hides the real error behind wrapper output.
- A shell wrapper may stay alive after the child exits.

# Verification
Confirm the log shows the underlying error or exit cause, and confirm only one live wrapper/child pair remains before rerunning.
