import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from build_sde_catalog import build_catalog


class BuildSdeCatalogTests(unittest.TestCase):
    def test_extracts_published_manufacturing_products_and_spanish_materials(self):
        records = {
            "blueprints.jsonl": [
                {
                    "_key": 200,
                    "blueprintTypeID": 200,
                    "activities": {
                        "manufacturing": {
                            "materials": [{"typeID": 34, "quantity": 120}],
                            "products": [{"typeID": 100, "quantity": 2}]
                        },
                        "invention": {
                            "products": [{"typeID": 101, "quantity": 1}]
                        }
                    }
                },
                {
                    "_key": 201,
                    "activities": {"invention": {"products": [{"typeID": 102}]}}
                }
            ],
            "types.jsonl": [
                {"_key": 34, "name": {"en": "Tritanium", "es": "Tritanio"}, "published": True, "volume": 0.01},
                {"_key": 100, "name": {"en": "Test ship", "es": "Nave de prueba"}, "published": True},
                {"_key": 101, "name": {"en": "Invented item"}, "published": True},
                {"_key": 102, "name": {"en": "Blueprint only"}, "published": True},
                {"_key": 200, "name": {"en": "Test ship Blueprint"}, "published": True}
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "sde.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                for filename, rows in records.items():
                    archive.writestr(
                        filename,
                        "\n".join(json.dumps(row) for row in rows) + "\n"
                    )

            catalog = build_catalog(archive_path)

        self.assertEqual(len(catalog), 1)
        self.assertEqual(catalog[0]["name"], "Nave de prueba")
        self.assertEqual(catalog[0]["englishName"], "Test ship")
        self.assertEqual(catalog[0]["outputQuantity"], 2)
        self.assertEqual(catalog[0]["materials"], [{
            "typeId": 34,
            "name": "Tritanio",
            "englishName": "Tritanium",
            "quantity": 120,
            "volume": 0.01
        }])


if __name__ == "__main__":
    unittest.main()
