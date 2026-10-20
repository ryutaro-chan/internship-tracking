#!/usr/bin/env python3
"""
tracker_cli.py — Command-line analytics & data management for JobTrackr.

JobTrackr — "Organize the hunt. Catch the offer." — stores internship
applications in the browser and can export them as a JSON file. This CLI loads
that JSON export and lets you analyze your job search from the terminal: status
distribution, conversion metrics, upcoming deadlines, and CSV report generation.

Usage examples
--------------
    python tracker_cli.py --summary
    python tracker_cli.py --summary --file my-export.json
    python tracker_cli.py --deadlines --within 14
    python tracker_cli.py --export-csv report.csv
    python tracker_cli.py --json            # machine-readable summary

If no --file is given, the script auto-detects the most recent
"jobtrackr*.json" export in the current directory.

The web app is entirely client-side, so this is a pure, dependency-free
companion tool (standard library only) — runs anywhere Python 3.8+ is present.
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional


# Canonical status pipeline (mirrors the web app's STATUSES order).
STATUS_ORDER: List[str] = [
    "Applied",
    "Online Assessment / Test",
    "Interview",
    "Offer Received",
    "Rejected",
    "Withdrawn",
]

# A status counts as "awaiting reply" (still live, no response yet).
PENDING_STATUSES = {"Applied", "Online Assessment / Test", "Interview"}

# Legacy -> current status remapping, matching the web app's migration rules.
LEGACY_STATUS_MAP = {
    "Not Started / To Apply": "Applied",
    "Applied / Pending": "Applied",
    "OA / Technical Assessment": "Online Assessment / Test",
    "Online Assessment": "Online Assessment / Test",
    "OA": "Online Assessment / Test",
    "HR / Screening Interview": "Interview",
    "Technical / Round 1 Interview": "Interview",
    "Final Round Interview": "Interview",
}


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #
@dataclass
class Application:
    """A single internship application row from a JobTrackr export."""

    company: str = ""
    role: str = ""
    status: str = "Applied"
    term: str = ""
    location: str = ""
    comp: str = ""
    applied_date: str = ""
    deadline: str = ""
    category: str = ""
    notes: str = ""
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Application":
        status = (d.get("status") or "Applied").strip()
        status = LEGACY_STATUS_MAP.get(status, status)
        if status not in STATUS_ORDER:
            status = "Applied"
        notes = " | ".join(
            part for part in (d.get("stageNotes"), d.get("prosCons")) if part
        )
        return cls(
            company=(d.get("company") or "").strip(),
            role=(d.get("role") or "").strip(),
            status=status,
            term=(d.get("term") or "").strip(),
            location=(d.get("location") or "").strip(),
            comp=(d.get("comp") or "").strip(),
            applied_date=(d.get("appliedDate") or "").strip(),
            deadline=(d.get("deadline") or "").strip(),
            category=(d.get("category") or "").strip(),
            notes=notes,
            raw=d,
        )

    @property
    def is_pending(self) -> bool:
        return self.status in PENDING_STATUSES

    @property
    def monthly_stipend(self) -> Optional[float]:
        """Best-effort parse of the comp string into a monthly figure."""
        return parse_stipend(self.comp)

    @property
    def deadline_date(self) -> Optional[date]:
        return parse_iso_date(self.deadline)

    def days_until_deadline(self, ref: Optional[date] = None) -> Optional[int]:
        d = self.deadline_date
        if d is None:
            return None
        ref = ref or date.today()
        return (d - ref).days


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def parse_iso_date(value: str) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def parse_stipend(comp: str) -> Optional[float]:
    """Parse '$2,500/month', '2.5k', '$36,000/year' -> a monthly number."""
    if not comp:
        return None
    s = comp.lower().replace(",", "")
    k_match = re.search(r"(\d+(?:\.\d+)?)\s*k\b", s)
    if k_match:
        value = float(k_match.group(1)) * 1000
    else:
        num = re.search(r"\d+(?:\.\d+)?", s)
        if not num:
            return None
        value = float(num.group(0))
    if re.search(r"year|annum|/yr|p\.a|pa\b", s):
        value /= 12
    elif re.search(r"week|/wk", s):
        value *= 4.33
    elif re.search(r"hour|/hr|hourly", s):
        value *= 160
    return round(value, 2)


# --------------------------------------------------------------------------- #
# Analytics engine
# --------------------------------------------------------------------------- #
class InternshipAnalytics:
    """Load a JobTrackr JSON export and compute job-search analytics."""

    def __init__(self, applications: Optional[List[Application]] = None) -> None:
        self.applications: List[Application] = applications or []

    # ---- loading --------------------------------------------------------- #
    @classmethod
    def from_file(cls, path: str) -> "InternshipAnalytics":
        if not os.path.exists(path):
            raise FileNotFoundError(f"Export file not found: {path}")
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, list):
            raise ValueError(
                "Unexpected JSON shape: expected a list of application objects."
            )
        return cls([Application.from_dict(item) for item in payload])

    @staticmethod
    def autodetect_file(directory: str = ".") -> Optional[str]:
        """Return the most recently modified JobTrackr JSON export."""
        candidates = glob.glob(os.path.join(directory, "jobtrackr*.json"))
        candidates += glob.glob(os.path.join(directory, "catchtheoffer-*.json"))  # legacy
        candidates += glob.glob(os.path.join(directory, "*.json"))
        candidates = [c for c in candidates if os.path.isfile(c)]
        if not candidates:
            return None
        return max(set(candidates), key=os.path.getmtime)

    # ---- metrics --------------------------------------------------------- #
    @property
    def total(self) -> int:
        return len(self.applications)

    def status_distribution(self) -> Dict[str, int]:
        """Count applications per status, in pipeline order."""
        counts = {status: 0 for status in STATUS_ORDER}
        for app in self.applications:
            counts[app.status] = counts.get(app.status, 0) + 1
        return counts

    def conversion_metrics(self) -> Dict[str, float]:
        """Headline conversion metrics for the job search."""
        total = self.total or 0
        offers = sum(1 for a in self.applications if a.status == "Offer Received")
        interviews = sum(1 for a in self.applications if a.status == "Interview")
        rejected = sum(1 for a in self.applications if a.status == "Rejected")
        responded = sum(1 for a in self.applications if a.status != "Applied")
        pending = sum(1 for a in self.applications if a.is_pending)

        def pct(part: int) -> float:
            return round(part / total * 100, 1) if total else 0.0

        return {
            "total": total,
            "pending": pending,
            "interviews": interviews,
            "offers": offers,
            "rejected": rejected,
            "response_rate_pct": pct(responded),
            "interview_rate_pct": pct(interviews + offers),
            "offer_rate_pct": pct(offers),
            "rejection_rate_pct": pct(rejected),
        }

    def upcoming_deadlines(self, within_days: Optional[int] = None) -> List[Application]:
        """Applications with a future (or today) deadline, soonest first."""
        today = date.today()
        rows = [
            a
            for a in self.applications
            if a.deadline_date is not None and a.days_until_deadline(today) is not None
        ]
        rows = [a for a in rows if a.days_until_deadline(today) >= 0]
        if within_days is not None:
            rows = [a for a in rows if a.days_until_deadline(today) <= within_days]
        return sorted(rows, key=lambda a: a.deadline_date)  # type: ignore[arg-type]

    def category_distribution(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for app in self.applications:
            key = app.category or "Uncategorized"
            counts[key] = counts.get(key, 0) + 1
        return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    def average_stipend(self) -> Optional[float]:
        values = [a.monthly_stipend for a in self.applications if a.monthly_stipend]
        if not values:
            return None
        return round(sum(values) / len(values), 2)

    # ---- exports --------------------------------------------------------- #
    def export_csv(self, path: str) -> int:
        """Write a formatted CSV report. Returns the number of rows written."""
        columns = [
            "Company Name",
            "Job Title",
            "Category",
            "Status",
            "Date Applied",
            "Deadline",
            "Days To Deadline",
            "Location",
            "Monthly Stipend",
            "Notes",
        ]
        with open(path, "w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.writer(handle)
            writer.writerow(columns)
            for a in self.applications:
                days = a.days_until_deadline()
                writer.writerow(
                    [
                        a.company,
                        a.role,
                        a.category or "",
                        a.status,
                        a.applied_date,
                        a.deadline,
                        "" if days is None else days,
                        a.location,
                        "" if a.monthly_stipend is None else f"{a.monthly_stipend:.0f}",
                        a.notes,
                    ]
                )
        return len(self.applications)

    def summary_dict(self) -> Dict[str, Any]:
        """Machine-readable summary (used by --json)."""
        return {
            "metrics": self.conversion_metrics(),
            "status_distribution": self.status_distribution(),
            "category_distribution": self.category_distribution(),
            "average_monthly_stipend": self.average_stipend(),
            "upcoming_deadlines": [
                {
                    "company": a.company,
                    "role": a.role,
                    "deadline": a.deadline,
                    "days_left": a.days_until_deadline(),
                }
                for a in self.upcoming_deadlines(within_days=30)
            ],
        }


# --------------------------------------------------------------------------- #
# Pretty terminal output
# --------------------------------------------------------------------------- #
def _bar(count: int, total: int, width: int = 24) -> str:
    if total <= 0:
        return ""
    filled = int(round(count / total * width))
    return "█" * filled + "·" * (width - filled)


def print_summary(engine: InternshipAnalytics) -> None:
    metrics = engine.conversion_metrics()
    dist = engine.status_distribution()
    total = engine.total

    print("\n  JobTrackr — Job Search Summary")
    print("  " + "=" * 42)
    print(f"  Total applications : {metrics['total']}")
    print(f"  Awaiting reply     : {metrics['pending']}")
    print(f"  Interviewing       : {metrics['interviews']}")
    print(f"  Offers received    : {metrics['offers']}")
    print(f"  Rejected           : {metrics['rejected']}")
    print()
    print(f"  Response rate      : {metrics['response_rate_pct']}%")
    print(f"  Interview rate     : {metrics['interview_rate_pct']}%")
    print(f"  Offer rate         : {metrics['offer_rate_pct']}%")

    avg = engine.average_stipend()
    if avg:
        print(f"  Avg monthly stipend: ${avg:,.0f}")

    print("\n  Status distribution")
    print("  " + "-" * 42)
    for status in STATUS_ORDER:
        count = dist.get(status, 0)
        print(f"  {status:<20} {_bar(count, total)} {count}")

    cats = engine.category_distribution()
    if cats:
        print("\n  By category")
        print("  " + "-" * 42)
        for name, count in cats.items():
            print(f"  {name:<28} {count}")

    print_deadlines(engine, within_days=14, heading="Upcoming deadlines (14 days)")
    print()


def print_deadlines(
    engine: InternshipAnalytics,
    within_days: Optional[int] = None,
    heading: str = "Upcoming deadlines",
) -> None:
    rows = engine.upcoming_deadlines(within_days=within_days)
    print(f"\n  {heading}")
    print("  " + "-" * 42)
    if not rows:
        print("  (none)")
        return
    for app in rows:
        days = app.days_until_deadline()
        flag = "TODAY" if days == 0 else (f"{days}d" if days is not None else "")
        marker = "!!" if (days is not None and days <= 3) else "  "
        print(f"  {marker} {flag:>6}  {app.company} — {app.role}  ({app.deadline})")


# --------------------------------------------------------------------------- #
# CLI entry point
# --------------------------------------------------------------------------- #
def resolve_input_file(explicit: Optional[str]) -> str:
    if explicit:
        return explicit
    detected = InternshipAnalytics.autodetect_file(".")
    if not detected:
        print(
            "No JSON export found. Export your data from JobTrackr "
            "(More ▸ Export data) into this folder, or pass --file <path>.",
            file=sys.stderr,
        )
        sys.exit(2)
    print(f"(using auto-detected export: {detected})", file=sys.stderr)
    return detected


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tracker_cli.py",
        description="Analyze JobTrackr internship application exports from the CLI.",
    )
    parser.add_argument("--file", "-f", help="Path to a JobTrackr JSON export.")
    parser.add_argument("--summary", action="store_true", help="Print a full job-search summary.")
    parser.add_argument("--deadlines", action="store_true", help="List upcoming deadlines.")
    parser.add_argument("--within", type=int, default=None, help="Limit deadlines to N days ahead.")
    parser.add_argument("--export-csv", metavar="PATH", help="Write a formatted CSV report to PATH.")
    parser.add_argument("--json", action="store_true", help="Print a machine-readable JSON summary.")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # Default action when nothing specific is requested.
    if not any([args.summary, args.deadlines, args.export_csv, args.json]):
        args.summary = True

    path = resolve_input_file(args.file)
    try:
        engine = InternshipAnalytics.from_file(path)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as err:
        print(f"Error loading '{path}': {err}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(engine.summary_dict(), indent=2))
        return 0

    if args.summary:
        print_summary(engine)

    if args.deadlines:
        print_deadlines(
            engine,
            within_days=args.within,
            heading=f"Upcoming deadlines"
            + (f" ({args.within} days)" if args.within else ""),
        )

    if args.export_csv:
        count = engine.export_csv(args.export_csv)
        print(f"Wrote {count} application(s) to {args.export_csv}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
