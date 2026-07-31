import tempfile
import unittest
import hashlib
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class ProductTemplateTests(unittest.TestCase):
    def test_get_product_template_keeps_blank_user_template_without_builtin_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            template_file = Path(tmpdir) / "product_template.txt"
            template_file.write_text("   \n\t", encoding="utf-8")

            with patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", template_file):
                result = backend_main.get_product_template()

            self.assertEqual(result["template"], "")
            self.assertEqual(template_file.read_text(encoding="utf-8"), "   \n\t")

    def test_get_product_template_clears_legacy_builtin_template_file(self):
        legacy_template = "legacy built-in product structure"
        legacy_hash = hashlib.sha256(legacy_template.encode("utf-8")).hexdigest()
        with tempfile.TemporaryDirectory() as tmpdir:
            template_file = Path(tmpdir) / "product_template.txt"
            template_file.write_text(legacy_template, encoding="utf-8")

            with patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", template_file), \
                 patch.object(backend_main, "LEGACY_DEFAULT_PRODUCT_TEMPLATE_SHA256", legacy_hash):
                result = backend_main.get_product_template()

            self.assertEqual(result["template"], "")
            self.assertEqual(template_file.read_text(encoding="utf-8"), "")


if __name__ == "__main__":
    unittest.main()
