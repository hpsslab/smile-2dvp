#!/usr/bin/env python3
"""Convert DOCX reference files into structured HTML snippets and mapping JSON."""

from __future__ import annotations

import argparse
import html
import io
import json
import logging
import re
import shutil
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from xml.etree import ElementTree as ET

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture"
V_NS = "urn:schemas-microsoft-com:vml"
NS = {"w": W_NS, "r": R_NS, "a": A_NS, "wp": WP_NS, "pic": PIC_NS, "v": V_NS}

ORDERED_NUMFMTS = {
    "decimal",
    "decimalZero",
    "upperRoman",
    "lowerRoman",
    "upperLetter",
    "lowerLetter",
    "ordinal",
    "cardinalText",
}

DOC_SYNONYMS: Dict[str, List[str]] = {
    "chem_cabinet": ["Chemical Cabinet", "chem_cabinet", "chemical cabinet"],
    "dry_etching": [
        "Dry Etching Tool",
        "Dry Etcher",
        "dry_etching",
        "dry etching",
        "dry_etching_a",
        "dry_etching_b",
    ],
    "EBE": [
        "Electron Beam Evaporator",
        "Electron Beam Evaporator 2",
        "Electron Beam Evaporator 3",
        "EBE",
        "EBE_a",
        "EBE_b",
        "EBE_2",
        "EBE_2_a",
        "EBE_2_b",
        "EBE_3",
        "EBE_3_a",
        "EBE_3_b",
    ],
    "EBE_control": ["EBE_control", "EBE Control", "Electron Beam Evaporator Control"],
    "EBL": ["Electron Beam Lithography", "EBL", "EBL_a", "EBL_b"],
    "EBL_control": ["Electron Beam Lithography Control", "EBL_control"],
    "fume_hood": [
        "Fume Hood",
        "Fume Hood (Wet Bench)",
        "fume_hood",
        "fume hood",
        "fume_hood_b",
    ],
    "gear_rack": ["Gear Rack", "gear_rack"],
    "gown_rack": ["Gown Rack", "gown_rack"],
    "hot_plate": ["Hot Plate", "hot_plate"],
    "mask_aligner": ["Mask Aligner", "mask_aligner"],
    "microscope": ["Microscope", "microscope"],
    "oven": ["Oven", "oven", "Furnace"],
    "SEM": ["Scanning Electron Microscope", "SEM", "SEM_a"],
    "SEM_control": ["SEM_control", "SEM Control", "SEM_control_a"],
    "shower": ["Shower", "shower"],
    "spill_control": ["Spill Control Station", "spill_control"],
    "spin_coater": ["Spin Coater", "spin_coater"],
    "ult_bath": ["Ultrasonic Bath", "ult_bath"],
}


def _qname(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


def html_escape(text: Optional[str]) -> str:
    return html.escape(text or "", quote=True)


def normalize_alias(value: str) -> Iterable[str]:
    """Produce a handful of normalized variants for mapping lookups."""
    if not value:
        return []

    base = value.strip()
    variants = {
        base,
        base.lower(),
        re.sub(r"\s+", "_", base.strip().lower()),
        re.sub(r"\s+", "-", base.strip().lower()),
        re.sub(r"[^a-z0-9]+", "_", base.strip().lower()),
    }
    return variants


def expanded_mapping() -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for slug, aliases in DOC_SYNONYMS.items():
        html_path = f"/descriptions/{slug}.html"
        for alias in aliases:
            for variant in normalize_alias(alias):
                if not variant:
                    continue
                mapping[variant] = html_path
        # Always map the slug itself and a title-cased variant for consistency
        mapping[slug] = html_path
        mapping[slug.lower()] = html_path
        mapping[slug.replace("_", "-")] = html_path
        mapping[slug.replace("_", " ")] = html_path
        mapping[slug.replace("_", " ").title()] = html_path
        mapping[slug.replace("_", "/")] = html_path
    return mapping


class NumberingDefinitions:
    def __init__(self, doc_zip: zipfile.ZipFile) -> None:
        self.levels: Dict[int, Dict[int, Dict[str, str]]] = defaultdict(dict)
        try:
            with doc_zip.open("word/numbering.xml") as numbering:
                tree = ET.parse(numbering)
        except KeyError:
            return

        root = tree.getroot()
        abstract_map: Dict[int, Dict[int, Dict[str, str]]] = {}

        for abstract in root.findall(_qname(W_NS, "abstractNum")):
            abstract_id_attr = abstract.get(_qname(W_NS, "abstractNumId"))
            if abstract_id_attr is None:
                continue
            abstract_id = int(abstract_id_attr)
            lvl_map: Dict[int, Dict[str, str]] = {}
            for lvl in abstract.findall(_qname(W_NS, "lvl")):
                ilvl_attr = lvl.get(_qname(W_NS, "ilvl"))
                if ilvl_attr is None:
                    continue
                ilvl = int(ilvl_attr)
                num_fmt_el = lvl.find(_qname(W_NS, "numFmt"))
                text_el = lvl.find(_qname(W_NS, "lvlText"))
                lvl_map[ilvl] = {
                    "fmt": num_fmt_el.get(_qname(W_NS, "val")) if num_fmt_el is not None else "bullet",
                    "text": text_el.get(_qname(W_NS, "val")) if text_el is not None else "",
                }
            abstract_map[abstract_id] = lvl_map

        for num in root.findall(_qname(W_NS, "num")):
            num_id_attr = num.get(_qname(W_NS, "numId"))
            if num_id_attr is None:
                continue
            num_id = int(num_id_attr)
            abs_el = num.find(_qname(W_NS, "abstractNumId"))
            if abs_el is None:
                continue
            abs_id_attr = abs_el.get(_qname(W_NS, "val"))
            if abs_id_attr is None:
                continue
            abs_id = int(abs_id_attr)
            self.levels[num_id] = abstract_map.get(abs_id, {})

    def resolve(self, num_id: int, ilvl: int) -> Optional[Dict[str, str]]:
        return self.levels.get(num_id, {}).get(ilvl)


@dataclass
class Relationships:
    image_targets: Dict[str, str]
    hyperlinks: Dict[str, str]

    @classmethod
    def from_zip(cls, doc_zip: zipfile.ZipFile) -> "Relationships":
        image_targets: Dict[str, str] = {}
        hyperlinks: Dict[str, str] = {}
        try:
            with doc_zip.open("word/_rels/document.xml.rels") as rel_file:
                tree = ET.parse(rel_file)
        except KeyError:
            return cls(image_targets, hyperlinks)

        root = tree.getroot()
        for rel in root:
            r_id = rel.get("Id")
            target = rel.get("Target")
            if not r_id or not target:
                continue
            rel_type = rel.get("Type", "")
            if rel_type.endswith("/image"):
                image_targets[r_id] = target
            elif rel_type.endswith("/hyperlink"):
                hyperlinks[r_id] = target
        return cls(image_targets, hyperlinks)


class DocxConverter:
    def __init__(self, slug: str, data: bytes, image_dir: Path) -> None:
        self.slug = slug
        self.doc_zip = zipfile.ZipFile(io.BytesIO(data))
        self.image_dir = image_dir
        self.relationships = Relationships.from_zip(self.doc_zip)
        self.numbering = NumberingDefinitions(self.doc_zip)
        self.media_map = self._extract_images()
        self.first_heading: Optional[str] = None

    def _extract_images(self) -> Dict[str, str]:
        self.image_dir.mkdir(parents=True, exist_ok=True)
        mapping: Dict[str, str] = {}
        counter = 1
        for name in self.doc_zip.namelist():
            if not name.startswith("word/media/"):
                continue
            ext = Path(name).suffix.lower()
            new_name = f"{self.slug}_{counter}{ext or '.png'}"
            counter += 1
            with self.doc_zip.open(name) as source:
                target_path = self.image_dir / new_name
                with target_path.open("wb") as target:
                    shutil.copyfileobj(source, target)
            mapping[Path(name).name] = new_name
        return mapping

    def convert(self) -> Tuple[str, str]:
        try:
            with self.doc_zip.open("word/document.xml") as doc_stream:
                tree = ET.parse(doc_stream)
        except KeyError as exc:
            raise RuntimeError(f"{self.slug}: missing document.xml") from exc

        body = tree.getroot().find(_qname(W_NS, "body"))
        if body is None:
            raise RuntimeError(f"{self.slug}: no body element")

        html_parts: List[str] = []
        list_stack: List[str] = []

        for child in body:
            tag = child.tag
            if tag == _qname(W_NS, "p"):
                fragment, heading = self._render_paragraph(child, list_stack)
                if heading and not self.first_heading:
                    self.first_heading = heading
                html_parts.extend(fragment)
            elif tag == _qname(W_NS, "tbl"):
                html_parts.extend(self._close_lists(list_stack))
                html_parts.append(self._render_table(child))
            else:
                # Close any open lists and ignore other structural items (e.g., section properties)
                html_parts.extend(self._close_lists(list_stack))

        html_parts.extend(self._close_lists(list_stack))

        article_body = "".join(html_parts).strip()
        default_title = DOC_SYNONYMS.get(self.slug, [self.slug.replace("_", " ").title()])[0]
        title = self.first_heading or default_title
        article = (
            "<article class=\"smile-description\">\n"
            "  <header class=\"smile-description__header\">\n"
            f"    <h1>{html_escape(title)}</h1>\n"
            "  </header>\n"
            "  <div class=\"smile-description__content\">\n"
            f"{article_body}\n"
            "  </div>\n"
            "</article>\n"
        )
        return title, article

    def _close_lists(self, stack: List[str], keep: int = 0) -> List[str]:
        fragments: List[str] = []
        while len(stack) > keep:
            tag = stack.pop()
            fragments.append(f"</{tag}>\n")
        return fragments

    def _render_paragraph(
        self,
        element: ET.Element,
        list_stack: List[str],
    ) -> Tuple[List[str], Optional[str]]:
        fragments: List[str] = []
        p_pr = element.find(_qname(W_NS, "pPr"))
        style_el = p_pr.find(_qname(W_NS, "pStyle")) if p_pr is not None else None
        style_val = style_el.get(_qname(W_NS, "val")) if style_el is not None else ""

        num_pr = p_pr.find(_qname(W_NS, "numPr")) if p_pr is not None else None
        if num_pr is not None:
            num_id_el = num_pr.find(_qname(W_NS, "numId"))
            ilvl_el = num_pr.find(_qname(W_NS, "ilvl"))
            num_id = int(num_id_el.get(_qname(W_NS, "val"))) if num_id_el is not None else None
            ilvl = int(ilvl_el.get(_qname(W_NS, "val"))) if ilvl_el is not None else 0
        else:
            num_id = None
            ilvl = 0

        content = self._render_runs(element)
        # Ignore empty paragraphs unless they carry images or structural content
        stripped_content = content.strip()

        if num_id is not None:
            desired_info = self.numbering.resolve(num_id, ilvl) or {}
            desired_tag = "ol" if desired_info.get("fmt") in ORDERED_NUMFMTS else "ul"
            fragments.extend(self._close_lists(list_stack, keep=ilvl + 1))
            if len(list_stack) < ilvl + 1:
                for level in range(len(list_stack), ilvl + 1):
                    level_info = self.numbering.resolve(num_id, level) or {}
                    level_tag = "ol" if level_info.get("fmt") in ORDERED_NUMFMTS else "ul"
                    fragments.append(f"<{level_tag}>\n")
                    list_stack.append(level_tag)
            if list_stack:
                current_tag = list_stack[-1]
                if current_tag != desired_tag:
                    fragments.append(f"</{current_tag}>\n")
                    list_stack.pop()
                    fragments.append(f"<{desired_tag}>\n")
                    list_stack.append(desired_tag)
            if not list_stack:
                fragments.append(f"<{desired_tag}>\n")
                list_stack.append(desired_tag)
            fragments.append(f"  <li>{stripped_content}</li>\n")
            return fragments, None

        # Not a numbered paragraph -> close any open lists
        fragments.extend(self._close_lists(list_stack))

        if not stripped_content:
            return fragments, None

        heading_match = re.match(r"Heading(\d)", style_val or "")
        if heading_match:
            level = max(1, min(6, int(heading_match.group(1))))
            fragments.append(f"<h{level}>{stripped_content}</h{level}>\n")
            return fragments, html.unescape(stripped_content)

        if style_val in {"Title", "Subtitle"}:
            tag = "h1" if style_val == "Title" else "h2"
            fragments.append(f"<{tag}>{stripped_content}</{tag}>\n")
            return fragments, html.unescape(stripped_content)

        parts = [segment for segment in re.split(r"(<figure.*?</figure>)", stripped_content, flags=re.DOTALL) if segment]
        emitted = False
        for part in parts:
            if part.startswith("<figure"):
                fragments.append(f"{part}\n")
                emitted = True
            else:
                text_segment = part.strip()
                if text_segment:
                    fragments.append(f"<p>{text_segment}</p>\n")
                    emitted = True

        if emitted:
            return fragments, None

        fragments.append(f"<p>{stripped_content}</p>\n")
        return fragments, None

    def _render_runs(self, paragraph: ET.Element) -> str:
        pieces: List[str] = []
        for child in paragraph:
            tag = child.tag
            if tag == _qname(W_NS, "r"):
                pieces.append(self._render_run(child))
            elif tag == _qname(W_NS, "hyperlink"):
                pieces.append(self._render_hyperlink(child))
            elif tag == _qname(W_NS, "bookmarkStart") or tag == _qname(W_NS, "bookmarkEnd"):
                continue
            elif tag == _qname(W_NS, "proofErr"):
                continue
            else:
                # Fallback: attempt to render nested runs recursively
                pieces.append(self._render_runs(child))
        return "".join(pieces)

    def _render_hyperlink(self, element: ET.Element) -> str:
        r_id = element.get(_qname(R_NS, "id")) or element.get("id")
        href = self.relationships.hyperlinks.get(r_id, "#") if r_id else "#"
        content = self._render_runs(element)
        return f"<a href=\"{html_escape(href)}\" target=\"_blank\" rel=\"noopener\">{content}</a>"

    def _render_run(self, run: ET.Element) -> str:
        texts: List[str] = []
        for child in run:
            tag = child.tag
            if tag == _qname(W_NS, "t"):
                texts.append(html_escape(child.text))
            elif tag == _qname(W_NS, "tab"):
                texts.append("&emsp;")
            elif tag == _qname(W_NS, "br"):
                texts.append("<br />")
            elif tag == _qname(W_NS, "drawing"):
                image_html = self._render_drawing(child)
                if image_html:
                    texts.append(image_html)
            elif tag == _qname(V_NS, "shape"):
                # Legacy VML shapes: ignore but keep placeholder
                continue
            elif tag == _qname(W_NS, "fldChar"):
                continue
            elif tag == _qname(W_NS, "instrText"):
                continue
            else:
                texts.append(html_escape(child.text))

        content = "".join(texts)
        if not content:
            return ""

        r_pr = run.find(_qname(W_NS, "rPr"))
        if r_pr is None:
            return content

        if r_pr.find(_qname(W_NS, "b")) is not None:
            content = f"<strong>{content}</strong>"
        if r_pr.find(_qname(W_NS, "i")) is not None:
            content = f"<em>{content}</em>"
        if r_pr.find(_qname(W_NS, "u")) is not None:
            content = f"<span style=\"text-decoration: underline;\">{content}</span>"
        vert_align = r_pr.find(_qname(W_NS, "vertAlign"))
        if vert_align is not None:
            val = vert_align.get(_qname(W_NS, "val"))
            if val == "superscript":
                content = f"<sup>{content}</sup>"
            elif val == "subscript":
                content = f"<sub>{content}</sub>"
        return content

    def _render_drawing(self, drawing: ET.Element) -> str:
        blip = drawing.find(".//" + _qname(A_NS, "blip"))
        if blip is None:
            return ""
        r_id = blip.get(_qname(R_NS, "embed"))
        if not r_id:
            return ""
        target = self.relationships.image_targets.get(r_id)
        if not target:
            return ""
        filename = Path(target).name
        mapped_name = self.media_map.get(filename)
        if not mapped_name:
            return ""

        width = height = None
        extent = drawing.find(".//" + _qname(WP_NS, "extent"))
        if extent is not None:
            cx = extent.get("cx")
            cy = extent.get("cy")
            try:
                width = int(cx) if cx else None
                height = int(cy) if cy else None
            except ValueError:
                width = height = None
        style_attrs = ["display: block", "width: 100%", "height: auto"]
        aspect_ratio = None
        if width and height and height != 0:
            width_px = emu_to_px(width)
            height_px = emu_to_px(height)
            if width_px and height_px:
                aspect_ratio = f"{width_px} / {height_px}"
        if aspect_ratio:
            style_attrs.append(f"aspect-ratio: {aspect_ratio}")
        style_attr = f" style=\"{' ; '.join(style_attrs)}\"" if style_attrs else ""
        caption = drawing.find(".//" + _qname(WP_NS, "docPr"))
        alt_text = caption.get("descr") if caption is not None else ""
        img_src = f"/descriptions/images/{mapped_name}"
        return (
            "<figure class=\"smile-description__media\">"
            f"<img src=\"{img_src}\" alt=\"{html_escape(alt_text)}\""
            " loading=\"lazy\" decoding=\"async\""
            f"{style_attr} />"
            "</figure>"
        )

    def _render_table(self, table: ET.Element) -> str:
        rows: List[str] = []
        for tr in table.findall(_qname(W_NS, "tr")):
            cells: List[str] = []
            for tc in tr.findall(_qname(W_NS, "tc")):
                cell_fragments: List[str] = []
                cell_stack: List[str] = []
                for child in tc:
                    if child.tag == _qname(W_NS, "p"):
                        fragment, _heading = self._render_paragraph(child, cell_stack)
                        cell_fragments.extend(fragment)
                    elif child.tag == _qname(W_NS, "tbl"):
                        cell_fragments.append(self._render_table(child))
                cell_fragments.extend(self._close_lists(cell_stack))
                cell_html = "".join(cell_fragments).strip() or "&nbsp;"
                cells.append(f"<td>{cell_html}</td>")
            rows.append(f"<tr>{''.join(cells)}</tr>")
        return f"<table class=\"smile-description__table\">{''.join(rows)}</table>"


def emu_to_px(emu: int) -> int:
    # 1 inch == 914400 EMUs, 1 inch == 96 CSS pixels
    return max(1, round(emu * 96 / 914400))


def convert_zip(
    zip_path: Path,
    output_dir: Path,
    image_subdir: str,
    mapping_path: Path,
    clean: bool,
) -> None:
    if not zip_path.exists():
        raise FileNotFoundError(zip_path)

    output_dir.mkdir(parents=True, exist_ok=True)
    image_dir = output_dir / image_subdir
    image_dir.mkdir(parents=True, exist_ok=True)

    if clean:
        for html_file in output_dir.glob("*.html"):
            html_file.unlink()
        if image_dir.exists():
            shutil.rmtree(image_dir)
            image_dir.mkdir(parents=True, exist_ok=True)

    generated: Dict[str, str] = {}

    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if not info.filename.lower().endswith(".docx"):
                continue
            slug = Path(info.filename).stem
            logging.info("Converting %s", info.filename)
            data = archive.read(info.filename)
            converter = DocxConverter(slug=slug, data=data, image_dir=image_dir)
            title, article = converter.convert()
            output_file = output_dir / f"{slug}.html"
            with output_file.open("w", encoding="utf-8") as fh:
                fh.write(article)
            generated[slug] = title

    mapping = expanded_mapping()
    mapping_path.parent.mkdir(parents=True, exist_ok=True)
    with mapping_path.open("w", encoding="utf-8") as fh:
        json.dump(mapping, fh, indent=2, sort_keys=True)
        fh.write("\n")

    logging.info("Wrote %d HTML files and mapping to %s", len(generated), mapping_path)


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--zip",
        dest="zip_path",
        type=Path,
        default=Path("refs.zip"),
        help="Path to the ZIP bundle containing DOCX files (default: refs.zip)",
    )
    parser.add_argument(
        "--output",
        dest="output_dir",
        type=Path,
        default=Path("public/descriptions"),
        help="Directory where HTML files will be written",
    )
    parser.add_argument(
        "--images-subdir",
        dest="image_subdir",
        default="images",
        help="Subdirectory under the output directory for extracted images",
    )
    parser.add_argument(
        "--mapping",
        dest="mapping_path",
        type=Path,
        default=Path("public/descriptions/mapping.json"),
        help="Path to the JSON mapping file",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove previously generated HTML files and images before conversion",
    )
    parser.add_argument(
        "--log-level",
        dest="log_level",
        default="INFO",
        help="Logging verbosity (default: INFO)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Iterable[str]] = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(level=args.log_level.upper(), format="[%(levelname)s] %(message)s")
    convert_zip(
        zip_path=args.zip_path,
        output_dir=args.output_dir,
        image_subdir=args.image_subdir,
        mapping_path=args.mapping_path,
        clean=args.clean,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
