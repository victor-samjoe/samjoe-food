"""Read-only structural audit for legacy SamJoE XLSX workbooks.

The report intentionally avoids printing row-level values from customer and order
data. It emits sheet structure, headers, formula/validation counts and aggregates
for a small allowlist of operational status columns.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


AGGREGATE_HEADER_TERMS = (
    "status",
    "situação",
    "situacao",
    "pagamento",
    "origem",
    "ativo",
    "área",
    "area",
    "entrega",
)


def normalized_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def find_header_row(worksheet: Any, search_rows: int = 10) -> tuple[int, list[str]]:
    best_row = 1
    best_headers: list[str] = []
    for row_number in range(1, min(worksheet.max_row, search_rows) + 1):
        values = [worksheet.cell(row_number, column).value for column in range(1, worksheet.max_column + 1)]
        headers = [str(value).strip() if value is not None else "" for value in values]
        score = sum(bool(header) for header in headers)
        if score > sum(bool(header) for header in best_headers):
            best_row = row_number
            best_headers = headers
    while best_headers and not best_headers[-1]:
        best_headers.pop()
    return best_row, best_headers


def safe_aggregates(worksheet: Any, header_row: int, headers: list[str]) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for column, header in enumerate(headers, start=1):
        header_normalized = normalized_text(header)
        if not header or not any(term in header_normalized for term in AGGREGATE_HEADER_TERMS):
            continue

        counts: Counter[str] = Counter()
        for row in range(header_row + 1, worksheet.max_row + 1):
            value = worksheet.cell(row, column).value
            if value is None or value == "" or str(value).startswith("="):
                continue
            counts[str(value).strip()] += 1

        if 0 < len(counts) <= 50:
            result[header] = dict(counts.most_common())
        elif counts:
            result[header] = {"<muitos valores distintos>": sum(counts.values())}
    return result


def audit_workbook(path: Path) -> dict[str, Any]:
    workbook = load_workbook(path, read_only=False, data_only=False, keep_links=True)
    sheets: list[dict[str, Any]] = []

    for worksheet in workbook.worksheets:
        header_row, headers = find_header_row(worksheet)
        formula_count = 0
        external_formula_count = 0
        populated_rows = 0
        formula_rows = 0
        constant_data_rows = 0

        for row_number, row in enumerate(worksheet.iter_rows(), start=1):
            has_value = False
            has_formula = False
            has_constant = False
            for cell in row:
                value = cell.value
                if value not in (None, ""):
                    has_value = True
                if isinstance(value, str) and value.startswith("="):
                    formula_count += 1
                    has_formula = True
                    if "[" in value and "]" in value:
                        external_formula_count += 1
                elif value not in (None, ""):
                    has_constant = True
            if has_value:
                populated_rows += 1
            if row_number > header_row and has_formula:
                formula_rows += 1
            if row_number > header_row and has_constant:
                constant_data_rows += 1

        validations = []
        for validation in worksheet.data_validations.dataValidation:
            validations.append({
                "type": validation.type,
                "ranges": str(validation.sqref),
            })

        sheets.append({
            "name": worksheet.title,
            "state": worksheet.sheet_state,
            "dimensions": worksheet.calculate_dimension(),
            "populated_rows": populated_rows,
            "formula_rows_after_header": formula_rows,
            "constant_rows_after_header": constant_data_rows,
            "header_row": header_row,
            "headers": headers,
            "formula_count": formula_count,
            "external_formula_count": external_formula_count,
            "merged_ranges": [str(item) for item in worksheet.merged_cells.ranges],
            "data_validations": validations,
            "safe_aggregates": safe_aggregates(worksheet, header_row, headers),
        })

    defined_names = sorted(str(name) for name in workbook.defined_names)
    external_links = len(getattr(workbook, "_external_links", []))
    workbook.close()

    return {
        "file": str(path),
        "size_bytes": path.stat().st_size,
        "sheet_count": len(sheets),
        "defined_names": defined_names,
        "external_link_count": external_links,
        "sheets": sheets,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbooks", nargs="+", type=Path)
    args = parser.parse_args()

    report = [audit_workbook(path.resolve()) for path in args.workbooks]
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
