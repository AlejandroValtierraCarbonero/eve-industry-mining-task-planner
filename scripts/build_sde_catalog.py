#!/usr/bin/env python3
"""Build compact blueprint and asteroid-ore catalogs from CCP's official SDE."""

import argparse
import json
import zipfile
from pathlib import Path


def jsonl_rows(stream):
    for line in stream:
        if line.strip():
            yield json.loads(line)


def localized_name(type_record):
    names = type_record.get("name", {})
    if isinstance(names, str):
        return names, names
    if not isinstance(names, dict):
        return None, None
    english = names.get("en")
    spanish = names.get("es") or english
    return spanish, english


def build_ore_catalog(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        asteroid_category_ids = {
            row["_key"]
            for row in jsonl_rows(archive.open("categories.jsonl"))
            if localized_name(row)[1] == "Asteroid"
        }
        asteroid_group_ids = {
            row["_key"]
            for row in jsonl_rows(archive.open("groups.jsonl"))
            if row.get("categoryID") in asteroid_category_ids
        }
        compressed_type_ids = {
            row["compressedTypeID"]
            for row in jsonl_rows(archive.open("compressibleTypes.jsonl"))
            if row.get("compressedTypeID") is not None
        }

        mineral_names = {
            "Tritanium", "Pyerite", "Mexallon", "Isogen",
            "Nocxium", "Zydrine", "Megacyte", "Morphite"
        }
        ores = {}
        minerals = {}
        for record in jsonl_rows(archive.open("types.jsonl")):
            type_id = record.get("_key")
            name, english_name = localized_name(record)
            if not name or not english_name:
                continue
            if english_name in mineral_names:
                minerals[type_id] = (name, english_name)
            if (
                record.get("published")
                and record.get("groupID") in asteroid_group_ids
                and type_id not in compressed_type_ids
                and "compressed" not in english_name.casefold()
                and numeric_value(record.get("volume")) > 0
                and numeric_value(record.get("portionSize")) > 0
            ):
                ores[type_id] = {
                    "typeId": type_id,
                    "name": name,
                    "englishName": english_name,
                    "volume": record["volume"],
                    "portionSize": record["portionSize"]
                }

        for record in jsonl_rows(archive.open("typeMaterials.jsonl")):
            ore = ores.get(record.get("_key"))
            if not ore:
                continue
            yields = {}
            for material in record.get("materials", []):
                mineral = minerals.get(material.get("materialTypeID"))
                quantity = material.get("quantity")
                if mineral and isinstance(quantity, (int, float)) and quantity > 0:
                    yields[mineral[1]] = quantity
            if not yields:
                continue
            ore["yields"] = yields
            ore["batchVolume"] = ore["volume"] * ore["portionSize"]

    return sorted(
        (ore for ore in ores.values() if "yields" in ore),
        key=lambda ore: (ore["name"].casefold(), ore["typeId"])
    )


def numeric_value(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    return number


def build_catalog(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        blueprints = []
        needed_type_ids = set()
        for blueprint in jsonl_rows(archive.open("blueprints.jsonl")):
            activity = blueprint.get("activities", {}).get("manufacturing")
            if not activity:
                continue
            materials = activity.get("materials", [])
            if not materials:
                continue
            blueprint_type_id = blueprint.get("blueprintTypeID", blueprint.get("_key"))
            needed_type_ids.add(blueprint_type_id)
            needed_type_ids.update(item["typeID"] for item in materials)
            for product in activity.get("products", []):
                needed_type_ids.add(product["typeID"])
                blueprints.append({
                    "blueprintTypeId": blueprint_type_id,
                    "outputTypeId": product["typeID"],
                    "outputQuantity": product.get("quantity", 1),
                    "materials": materials
                })

        types = {}
        for record in jsonl_rows(archive.open("types.jsonl")):
            type_id = record.get("_key")
            if type_id not in needed_type_ids:
                continue
            name, english_name = localized_name(record)
            if name:
                types[type_id] = {
                    "name": name,
                    "englishName": english_name or name,
                    "published": record.get("published", False),
                    "volume": record.get("volume")
                }

    catalog = []
    for blueprint in blueprints:
        output = types.get(blueprint["outputTypeId"])
        blueprint_name = types.get(blueprint["blueprintTypeId"])
        if not output or not output["published"]:
            continue
        materials = []
        for material in blueprint["materials"]:
            material_type = types.get(material["typeID"])
            if not material_type:
                continue
            materials.append({
                "typeId": material["typeID"],
                "name": material_type["name"],
                "englishName": material_type["englishName"],
                "quantity": material["quantity"],
                "volume": material_type["volume"]
            })
        if not materials:
            continue
        catalog.append({
            "typeId": blueprint["outputTypeId"],
            "name": output["name"],
            "englishName": output["englishName"],
            "blueprintTypeId": blueprint["blueprintTypeId"],
            "blueprintName": blueprint_name["name"] if blueprint_name else None,
            "outputQuantity": blueprint["outputQuantity"],
            "materials": materials
        })

    catalog.sort(key=lambda item: (item["name"].casefold(), item["typeId"]))
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path, help="Official SDE JSONL zip")
    parser.add_argument("--output", required=True, type=Path, help="Output catalog JSON")
    parser.add_argument("--build-number", required=True, help="Official SDE build number")
    args = parser.parse_args()

    catalog = build_catalog(args.archive)
    ores = build_ore_catalog(args.archive)
    if not catalog or not ores:
        raise SystemExit("The SDE archive produced an empty blueprint or asteroid-ore catalog.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(
            {"buildNumber": args.build_number, "blueprints": catalog, "ores": ores},
            output,
            ensure_ascii=False,
            separators=(",", ":")
        )
    print(
        f"Built {len(catalog)} blueprint products and {len(ores)} asteroid ores "
        f"from SDE build {args.build_number}."
    )


if __name__ == "__main__":
    main()
