#!/usr/bin/env python3
"""Build a compact blueprint search catalog from CCP's official SDE JSONL zip."""

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
    if not catalog:
        raise SystemExit("The SDE archive produced an empty blueprint catalog.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(
            {"buildNumber": args.build_number, "blueprints": catalog},
            output,
            ensure_ascii=False,
            separators=(",", ":")
        )
    print(f"Built {len(catalog)} blueprint products from SDE build {args.build_number}.")


if __name__ == "__main__":
    main()
