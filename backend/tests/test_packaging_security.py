import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class PackagingSecurityTests(unittest.TestCase):
    def test_private_release_script_does_not_bundle_secrets_or_runtime_data(self):
        script = (PROJECT_ROOT / "scripts" / "package-amd64-private-release.sh").read_text(encoding="utf-8")

        forbidden_patterns = [
            r"cannot package runnable secrets",
            r"cp\s+\.env(?:\s|$)",
            r"cp\s+\.env\.server(?:\s|$)",
            r"cp\s+\.env\.local(?:\s|$)",
            r"\bkeys\b.*\bdata\b.*\bstate\b.*\bcache\b.*\bbackup\b",
            r"contains passwords, API keys",
        ]

        for pattern in forbidden_patterns:
            with self.subTest(pattern=pattern):
                self.assertIsNone(re.search(pattern, script))


if __name__ == "__main__":
    unittest.main()
