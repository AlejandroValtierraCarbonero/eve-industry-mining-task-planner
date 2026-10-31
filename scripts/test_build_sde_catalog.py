import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from build_sde_catalog import build_catalog, build_ore_catalog, ore_security_zones


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

    def test_extracts_published_uncompressed_asteroid_ores_and_mineral_yields(self):
        records = {
            "categories.jsonl": [
                {"_key": 25, "name": {"en": "Asteroid", "es": "Asteroide"}},
                {"_key": 6, "name": {"en": "Ship", "es": "Nave"}}
            ],
            "groups.jsonl": [
                {"_key": 462, "categoryID": 25, "name": {"en": "Veldspar"}},
                {"_key": 2, "categoryID": 6, "name": {"en": "Ship"}}
            ],
            "types.jsonl": [
                {"_key": 34, "name": {"en": "Tritanium", "es": "Tritanio"}, "published": True},
                {"_key": 35, "name": {"en": "Pyerite", "es": "Pierita"}, "published": True},
                {
                    "_key": 100, "name": {"en": "Veldspar", "es": "Veldspar"},
                    "groupID": 462, "published": True, "volume": 0.1, "portionSize": 100
                },
                {
                    "_key": 101, "name": {"en": "Compressed Veldspar", "es": "Veldspar comprimido"},
                    "groupID": 462, "published": True, "volume": 0.1, "portionSize": 1
                },
                {
                    "_key": 103, "name": {"en": "Batch Compressed Veldspar", "es": "Veldspar comprimido en lote"},
                    "groupID": 462, "published": True, "volume": 0.1, "portionSize": 1
                },
                {
                    "_key": 102, "name": {"en": "Test ship", "es": "Nave de prueba"},
                    "groupID": 2, "published": True, "volume": 10, "portionSize": 1
                }
            ],
            "typeMaterials.jsonl": [
                {
                    "_key": 100,
                    "materials": [
                        {"materialTypeID": 34, "quantity": 400},
                        {"materialTypeID": 35, "quantity": 10}
                    ]
                },
                {"_key": 101, "materials": [{"materialTypeID": 34, "quantity": 400}]},
                {"_key": 103, "materials": [{"materialTypeID": 34, "quantity": 400}]},
                {"_key": 102, "materials": [{"materialTypeID": 34, "quantity": 1000}]}
            ],
            "compressibleTypes.jsonl": [
                {"_key": 100, "compressedTypeID": 101}
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

            catalog = build_ore_catalog(archive_path)

        self.assertEqual(len(catalog), 1)
        self.assertEqual(catalog[0]["name"], "Veldspar")
        self.assertEqual(catalog[0]["portionSize"], 100)
        self.assertEqual(catalog[0]["volume"], 0.1)
        self.assertEqual(catalog[0]["batchVolume"], 10)
        self.assertEqual(catalog[0]["yields"], {"Tritanium": 400, "Pyerite": 10})
        self.assertEqual(catalog[0]["securityZones"], ["high", "medium", "null"])

    def test_assigns_belt_ore_security_from_official_distribution_rules(self):
        self.assertEqual(ore_security_zones("Veldspar"), ["high", "medium", "null"])
        self.assertEqual(ore_security_zones("Kernite"), ["low", "null"])
        self.assertEqual(ore_security_zones("Hemorphite"), ["high", "medium", "low"])
        self.assertEqual(ore_security_zones("Arkonor"), ["high", "medium", "low", "null"])
        self.assertEqual(ore_security_zones("Kangite"), ["high", "medium"])
        self.assertEqual(ore_security_zones("Mordunium"), ["null"])
        self.assertEqual(ore_security_zones("Ytirium"), ["unclassified"])
        self.assertEqual(ore_security_zones("Common Moon Asteroids"), ["unclassified"])
        self.assertEqual(ore_security_zones("Ice"), ["unclassified"])
        self.assertEqual(ore_security_zones("Unknown deposit"), ["unclassified"])


if __name__ == "__main__":
    unittest.main()
