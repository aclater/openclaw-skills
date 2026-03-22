#!/usr/bin/env python3
"""
Vibe Kingdom skill wrapper for OpenClaw.
Delegates to the Node.js implementation (vibe-kingdom.js).
"""

import os
import sys
import subprocess
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent.resolve()
NODE_SCRIPT = SCRIPTS_DIR / "vibe-kingdom.js"


def main():
    args = sys.argv[1:]

    if not NODE_SCRIPT.exists():
        print(f"Error: vibe-kingdom.js not found at {NODE_SCRIPT}", file=sys.stderr)
        sys.exit(1)

    result = subprocess.run(
        ["node", str(NODE_SCRIPT)] + args,
        env=os.environ.copy(),
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
