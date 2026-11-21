#!/usr/bin/env python3
"""Build a derived Fusion command index from local XML and API captures.

No Autodesk XML, tooltip text, or full API placement records are emitted.
"""

from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "tools/fusion-mcp/reference"
CATALOG = ROOT / "fusion-command-catalog.json"
OUTPUT = ROOT / "fusion-command-catalog-final.json"
REPORT = ROOT / "fusion-command-analysis.md"
XML_NAMES = {"CommandDefinitions.xml", "TabToolbars.xml", "Toolbars.xml", "MenuBar.xml", "MarkingMenus.xml"}
CONTROL_TAGS = {"Button", "DropDownItem", "MenuItem", "RadioButton", "SplitButton", "DropDownButton", "PanelDropdown"}
CONTAINER_TAGS = {"DropDownButton", "PanelDropdown", "Menu"}


def parse_xml(path: Path, issues: list[str]) -> ET.Element | None:
    source = path.read_text(encoding="utf-8-sig")
    # ElementTree does not resolve Autodesk's external DTD entities. Those
    # fragments were not among the 80 requested reference files.
    external = re.findall(r'<!ENTITY\s+([A-Za-z][\w.-]*)\s+SYSTEM\s+"[^"]+"', source)
    source = re.sub(r"<!DOCTYPE\s+\w+\s*\[.*?\]>", "", source, flags=re.S)
    entities = 0
    for name in external:
        source, count = re.subn(r"&" + re.escape(name) + r";", "", source)
        entities += count
    if entities:
        issues.append(f"{path.relative_to(REFERENCE)}: {entities} external entity reference(s) omitted")
    try:
        return ET.fromstring(source)
    except ET.ParseError as exc:
        issues.append(f"{path.relative_to(REFERENCE)}: XML parse error: {exc}")
        return None


def node_id(node: ET.Element) -> str:
    return node.get("Id", "").strip()


def segment(kind: str, value: str) -> dict[str, str]:
    return {"kind": kind, "id": value}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-placements", type=Path, required=True)
    parser.add_argument("--replace", action="store_true", help="replace prior generated outputs")
    args = parser.parse_args()
    if not args.replace and (OUTPUT.exists() or REPORT.exists()):
        raise SystemExit("Output exists; refusing to overwrite")
    base = json.loads(CATALOG.read_text(encoding="utf-8"))
    api = json.loads(args.api_placements.read_text(encoding="utf-8"))
    files = sorted(p for p in REFERENCE.rglob("*.xml") if p.name in XML_NAMES or p.parent.name == "ko-KR")
    if len(files) != 80:
        raise SystemExit(f"Expected 80 reference XML files; found {len(files)}")
    issues: list[str] = []
    parsed = {p: parse_xml(p, issues) for p in files}
    definitions: Counter[str] = Counter()
    translations: dict[str, set[str]] = defaultdict(set)
    placements: dict[str, dict[str, dict]] = defaultdict(dict)
    stats: Counter[str] = Counter()
    catalog = {item["id"]: item for item in base["commands"]}
    mcp_ids = set(catalog)

    for path, root in parsed.items():
        if root is None:
            continue
        if path.name == "CommandDefinitions.xml":
            for node in root.iter("CommandDefinition"):
                if node_id(node):
                    definitions[node_id(node)] += 1
        if path.parent.name == "ko-KR":
            for label in root.iter("label"):
                ident = label.get("commandName", "")
                name = label.get("translation", "")
                if ident and name and re.search("[가-힣]", name):
                    translations[ident].add(name)

    def add(ident: str, source: str, path: list[dict], location: str) -> None:
        if not ident:
            return
        catalog.setdefault(ident, {"id": ident, "name": ""})
        key = json.dumps([source, path], ensure_ascii=False, sort_keys=True)
        placements[ident][key] = {"source": source, "location": location, "path": path}
        stats[source] += 1

    def walk_controls(node: ET.Element, path: list[dict], source: str, location: str) -> None:
        for child in node:
            tag = child.tag
            ident = node_id(child)
            next_path = path
            if tag == "Menu":
                next_path = path + [segment("menu", ident or child.get("TypeId", "unnamed"))]
            if tag in CONTROL_TAGS and ident:
                if (tag in CONTAINER_TAGS or tag == "MenuItem") and len(child):
                    next_path = path + [segment("dropdown", ident)]
                add(ident, source, path + [segment("command", ident)], location)
            if len(child):
                walk_controls(child, next_path, source, location)

    for path, root in parsed.items():
        if root is None or path.parent.name == "ko-KR" or path.name == "CommandDefinitions.xml":
            continue
        source = path.name
        if source == "TabToolbars.xml":
            panels = {node_id(p): p for p in root.iter("Panel") if node_id(p)}
            for toolbar in root.iter("CommandToolbar"):
                ws = node_id(toolbar)
                for tab in toolbar.iter("Tab"):
                    tid = node_id(tab)
                    env = tab.get("Environment", "")
                    for pid in filter(None, (x.strip() for x in tab.get("Panels", "").split(";"))):
                        panel = panels.get(pid)
                        if panel is not None:
                            walk_controls(panel, [segment("workspace", env or ws), segment("tab", tid), segment("panel", pid)], source, "toolbar")
                for panel in toolbar.iter("Panel"):
                    if node_id(panel) and not any(node_id(panel) in t.get("Panels", "").split(";") for t in toolbar.iter("Tab")):
                        walk_controls(panel, [segment("workspace", ws), segment("panel", node_id(panel))], source, "toolbar")
            for toolbar in root.iter("Toolbar"):
                walk_controls(toolbar, [segment("toolbar", node_id(toolbar))], source, "toolbar")
        elif source == "Toolbars.xml":
            for toolbar in root.iter("Toolbar"):
                walk_controls(toolbar, [segment("toolbar", node_id(toolbar))], source, "toolbar")
        elif source in {"MenuBar.xml", "MarkingMenus.xml"}:
            walk_controls(root, [segment("menu", node_id(root) or source)], source, "menu")

    for item in api.get("placements", []):
        ident = item.get("commandId", "")
        path = []
        for part in item.get("path", []):
            for kind in ("workspace", "tab", "panel", "toolbar"):
                if isinstance(part.get(kind), dict):
                    path.append(segment(kind, part[kind].get("id", "")))
            control = part.get("controlId")
            if control and control != ident:
                path.append(segment("dropdown", control))
        path.append(segment("command", ident))
        add(ident, "fusion-api", path, "toolbar")

    output = []
    conflicts = []
    for ident, item in catalog.items():
        paths = list(placements[ident].values())
        paths.sort(key=lambda x: (x["location"] != "toolbar", len(x["path"]), x["source"], json.dumps(x["path"], sort_keys=True)))
        api_name = item.get("name", "")
        ko = sorted(translations.get(ident, []))
        if len(ko) > 1:
            conflicts.append(ident)
        name = api_name if re.search("[가-힣]", api_name) else (ko[0] if ko else api_name)
        debug = bool(paths) and all(any("debug" in part["id"].lower() for part in p["path"]) for p in paths)
        if not paths:
            category = "unplaced"
        elif debug:
            category = "debug_only"
        elif any(p["location"] == "toolbar" and not any(s["kind"] == "dropdown" for s in p["path"]) for p in paths):
            category = "direct_toolbar"
        elif any(p["location"] == "toolbar" for p in paths):
            category = "toolbar_dropdown"
        else:
            category = "menu_only"
        output.append({"id": ident, "name": name, "category": category,
                       "defaultVisible": category not in {"unplaced", "debug_only"} and ident in mcp_ids,
                       "seenInMcp": ident in mcp_ids,
                       "definedInXml": ident in definitions, "paths": paths})
    priority = {"direct_toolbar": 0, "toolbar_dropdown": 1, "menu_only": 2, "debug_only": 3, "unplaced": 4}
    output.sort(key=lambda x: (priority[x["category"]], x["name"].casefold(), x["id"]))
    categories = Counter(x["category"] for x in output)
    unique_api = {x.get("commandId") for x in api.get("placements", []) if x.get("commandId")}
    unique_xml = set(definitions)
    xml_placed = {ident for ident, matches in placements.items() if any(p["source"] != "fusion-api" for p in matches.values())}
    error_types = Counter(x.get("error", "unknown") for x in api.get("errors", []))
    report = ["# Fusion command catalog analysis", "",
              "## Inputs and method", "",
              f"- Reference XML: {len(files)} files (read locally; originals are not embedded in outputs)",
              f"- MCP catalog: {len(mcp_ids)} unique IDs",
              f"- Fusion API: {len(api.get('placements', []))} placements, {len(api.get('errors', []))} errors, {len(unique_api)} unique placed IDs",
              "- Output omits original XML text and tooltip prose; names are existing API names or exact Korean resource translations.",
              "- Runtime executability is unknown. `defaultVisible` is a catalog display choice, not proof a command can execute.", "",
              "## Rebuild", "",
              "Keep the private XML copies in `tools/fusion-mcp/reference/` and the MCP catalog at the project root. Run:", "",
              "`python tools/fusion-mcp/build-fusion-command-catalog.py --api-placements <fusion-ui-placements.json> --replace`", "",
              "Only the three derived artifacts are suitable for this repository; do not commit the reference XML or raw API capture.", "",
              "## Counts", "",
              f"- XML CommandDefinition entries: {sum(definitions.values())}; unique IDs: {len(unique_xml)}; repeated occurrences: {sum(definitions.values())-len(unique_xml)}",
              f"- XML definition IDs also in MCP catalog: {len(unique_xml & mcp_ids)}; XML-only definition IDs: {len(unique_xml-mcp_ids)}; MCP-only IDs: {len(mcp_ids-unique_xml)}",
              f"- Static XML placement IDs: {len(xml_placed)}; also in API placements: {len(xml_placed & unique_api)}; XML-only placements: {len(xml_placed-unique_api)}; API-only placements: {len(unique_api-xml_placed)}",
              f"- XML placement IDs absent from MCP catalog: {len(xml_placed-mcp_ids)} (retained, hidden by default)",
              f"- Final commands: {len(output)}; distinct paths: {sum(len(x['paths']) for x in output)}",
              *[f"- {name}: {categories[name]}" for name in priority],
              f"- Korean translation conflicts (multiple distinct exact translations for one ID): {len(conflicts)}", "",
              f"- Commands with no confirmed name: {sum(not x['name'] for x in output)}", "",
              "## Coverage and limitations", "",
              "- Repeated command IDs have one command record with multiple paths. Duplicate paths are removed by source and ordered ID chain.",
              "- Static XML declares possible placements; the API capture records runtime placements. Neither proves present executability.",
              "- `unplaced` commands remain in JSON but are hidden from the default list. A debug-only path is hidden; internal-only status is not asserted without evidence.",
              f"- API errors: {len(api.get('errors', []))}; XML does not identify the failed runtime control at those positions reliably.",
              *[f"- API error type `{kind}`: {count}" for kind, count in error_types.most_common()],
              f"- Unresolved XML entity references / parse issues: {len(issues)}. Shared DTD fragments outside the 80-file input were omitted; affected paths may be incomplete.",
              "", "## XML issues", "", *([f"- {issue}" for issue in issues] or ["- None"]), ""]
    OUTPUT.write_text(json.dumps({"format": "deckforge-fusion-command-catalog-v1", "commands": output}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(json.dumps({"commands": len(output), "categories": categories, "paths": sum(len(x["paths"]) for x in output), "issues": len(issues)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
