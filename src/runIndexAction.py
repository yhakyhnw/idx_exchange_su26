import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def resolve_node_binary() -> str:
    explicit = os.environ.get("NODE_BINARY")
    if explicit and Path(explicit).exists():
        return explicit

    from_path = shutil.which("node")
    if from_path:
        return from_path

    # If the current environment (often conda) hides Node, ask the login shell.
    shell = os.environ.get("SHELL")
    if shell and Path(shell).exists():
        try:
            login_shell = subprocess.run(
                [shell, "-lc", "command -v node"],
                capture_output=True,
                text=True,
                check=False,
            )
            shell_path = login_shell.stdout.strip()
            if shell_path and Path(shell_path).exists():
                return shell_path
        except Exception:
            pass

    raise FileNotFoundError(
        "Node binary not found. Install Node.js, add `node` to PATH, or set NODE_BINARY."
    )


def main() -> int:
    if len(sys.argv) < 3:
        print(
            "Usage: python3 src/runIndexAction.py <action> <query>",
            file=sys.stderr,
        )
        return 1

    action = sys.argv[1]
    query = " ".join(sys.argv[2:])

    request = {
        "action": action,
        "payload": {
            "query": query,
        },
    }

    repo_root = Path(__file__).resolve().parents[1]
    node_bin = resolve_node_binary()
    node_cmd = [
        node_bin,
        "--experimental-strip-types",
        "src/index.ts",
        json.dumps(request),
    ]

    completed = subprocess.run(node_cmd, cwd=str(repo_root), capture_output=True, text=True)

    def redact(text: str) -> str:
        home = str(Path.home())
        return text.replace(str(repo_root), ".").replace(home, "~")

    if completed.returncode != 0:
        if completed.stdout:
            print(redact(completed.stdout.strip()))
        if completed.stderr:
            print(redact(completed.stderr.strip()), file=sys.stderr)
        return completed.returncode

    print(redact((completed.stdout or "").strip()) or "There are no returned results.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
