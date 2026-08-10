---
name: "ts-cli-referenceerror-repair"
description: "Fix TS CLI ReferenceError/undefined identifier by reproducing, inspecting the failing file, patching the smallest scope, and re-running the same request."
---

# When to use
Use when a TypeScript CLI or utility crashes with `ReferenceError`, `... is not defined`, or a similar undefined identifier.

# Procedure
1. Reproduce with the exact command and smallest input that fails.
2. Read the failing file and the surrounding code path, not just the stack text.
3. Identify the undefined symbol and decide whether it should be:
   - defined from an existing source,
   - removed, or
   - replaced with a direct value already available in the function.
4. Patch the smallest scope that removes the crash.
5. Re-run the same command and input.
6. Confirm the result is non-error and still matches the intended shape.

# Pitfalls
- Do not chase unrelated tool failures once the code error is reproduced.
- Do not keep dead helper references if no source of truth exists in the file or imports.
- Do not widen the fix beyond the failing path.

# Verification
The same failing request should now complete successfully and print a valid result instead of a crash message.
