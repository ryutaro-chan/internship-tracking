#!/usr/bin/env python3
"""
generate_sample_data.py — Generate realistic mock internship applications.

Produces a JSON file in the exact shape CatchTheOffer imports/exports, so you
can populate the dashboard (via More ▸ Import) or feed it to tracker_cli.py for
analytics testing.

Usage
-----
    python generate_sample_data.py                 # 12 records -> catchtheoffer-sample.json
    python generate_sample_data.py --count 30
    python generate_sample_data.py --out demo.json --seed 7
    python generate_sample_data.py --count 20 --pretty
"""

from __future__ import annotations

import argparse
import json
import random
import string
import time
from datetime import date, timedelta
from typing import Any, Dict, List


STATUSES = [
    "Applied",
    "Online Assessment / Test",
    "Interview",
    "Offer Received",
    "Rejected",
    "Withdrawn",
]
# Weighted so the pipeline looks realistic (most still "Applied").
STATUS_WEIGHTS = [40, 15, 18, 8, 14, 5]

CATEGORIES = ["tech", "data", "fintech", "product"]

COMPANIES = [
    "Stripe", "Grab", "Razer", "Endowus", "Apple", "Shopee", "Visa",
    "Sea Group", "DBS Bank", "GovTech", "TikTok", "ByteDance", "Google",
    "Meta", "Amazon", "Microsoft", "Wise", "Nium", "Thought Machine",
    "Temasek", "GIC", "OCBC", "UOB", "Shopify", "Airbnb",
]

ROLES_BY_CATEGORY = {
    "tech": [
        "Software Engineering Intern", "Backend Developer Intern",
        "Full Stack Engineer Intern", "Mobile Engineering Intern",
        "DevOps / Platform Intern", "Site Reliability Intern",
    ],
    "data": [
        "Data Analytics Intern", "Data Science Intern",
        "Machine Learning Engineer Intern", "Data Engineering Intern",
        "Business Intelligence Intern",
    ],
    "fintech": [
        "Fintech Software Engineering Intern", "Payments Engineer Intern",
        "Quantitative Developer Intern", "Blockchain Engineer Intern",
    ],
    "product": [
        "Product Manager Intern", "Business Operations Intern",
        "Strategy & Operations Intern", "Growth Analyst Intern",
    ],
}

JD_SNIPPETS = {
    "tech": "Build and ship backend APIs in Python/Go, work with cloud "
            "infrastructure, databases, and CI/CD pipelines in an agile team.",
    "data": "Develop machine learning models and analytics pipelines using "
            "Python, SQL and visualization tools to surface product insights.",
    "fintech": "Work on payments and digital finance systems — APIs, "
               "blockchain integrations and transaction processing at scale.",
    "product": "Drive product strategy and operations, analyze metrics, and "
               "coordinate cross-functional launches with engineering.",
}

LOCATIONS = [
    "Singapore / On-site", "Singapore / Hybrid", "Remote",
    "Singapore / Hybrid", "Hybrid", "Singapore / On-site",
]

TERMS = [
    "Summer 2027 (May–Aug)", "Winter 2026", "Off-Peak",
    "Summer 2027", "Spring 2027", "Year-long",
]

PRIORITIES = ["High", "Medium", "Low", ""]

CONTACTS = [
    "Jane Tan (LinkedIn)", "Alex Lim, Recruiter", "Priya R. (referral)",
    "Wei Jie, Eng Manager", "", "", "Sarah Chen (alumni)",
]

RESUME_VERSIONS = [
    "SWE_Resume_v3.pdf", "Data_Analytics_v2.pdf", "Fintech_Tailored_CL.docx",
    "General_Resume.pdf", "", "Product_Resume_v1.pdf",
]


def _iso(d: date) -> str:
    return d.isoformat()


def _uid() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(9))


def _stipend_for(category: str) -> str:
    base = {
        "tech": (1800, 3500),
        "data": (1600, 3000),
        "fintech": (2000, 4000),
        "product": (1500, 2800),
    }[category]
    amount = random.randrange(base[0], base[1], 100)
    return f"${amount:,}/month"


def make_record(today: date) -> Dict[str, Any]:
    category = random.choice(CATEGORIES)
    role = random.choice(ROLES_BY_CATEGORY[category])
    status = random.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0]

    applied_offset = -random.randint(1, 60)
    applied = today + timedelta(days=applied_offset)
    # Deadline somewhere around / after the application date.
    deadline = today + timedelta(days=random.randint(-14, 30))

    record: Dict[str, Any] = {
        "id": _uid(),
        "company": random.choice(COMPANIES),
        "role": role,
        "term": random.choice(TERMS),
        "location": random.choice(LOCATIONS),
        "status": status,
        "category": category,
        "jobdesc": JD_SNIPPETS[category],
        "url": "",
        "appliedDate": _iso(applied),
        "deadline": _iso(deadline),
        "comp": _stipend_for(category),
        "priority": random.choice(PRIORITIES),
        "referral": random.choice(CONTACTS),
        "docs": random.choice(RESUME_VERSIONS),
        "bookmarked": random.random() < 0.2,
        "_updated": int(time.time() * 1000) - random.randint(0, 5_000_000),
    }

    # Stage-specific extra context.
    if status == "Online Assessment / Test":
        record["oaDate"] = _iso(today + timedelta(days=random.randint(1, 7)))
        record["stageNotes"] = "Completed online assessment; awaiting results."
        record["nextAction"] = "Review OA feedback"
    elif status == "Interview":
        record["interviewDates"] = _iso(today + timedelta(days=random.randint(1, 10)))
        record["stageNotes"] = "Technical interview scheduled."
        record["nextAction"] = "Prep system design & behavioural questions"
    elif status == "Offer Received":
        record["offerDeadline"] = _iso(today + timedelta(days=random.randint(5, 20)))
        record["hours"] = "Full-time, 12 weeks"
        record["prosCons"] = "Pros: strong brand, good pay. Cons: commute."
        record["nextAction"] = "Decide before offer deadline"
    elif status == "Applied":
        record["followup"] = _iso(applied)
        record["nextAction"] = "Follow up with recruiter if no reply in 2 weeks"

    return record


def generate(count: int, seed: int | None = None) -> List[Dict[str, Any]]:
    if seed is not None:
        random.seed(seed)
    today = date.today()
    return [make_record(today) for _ in range(count)]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="generate_sample_data.py",
        description="Generate mock CatchTheOffer internship applications as JSON.",
    )
    parser.add_argument("--count", "-n", type=int, default=12, help="How many records (default 12).")
    parser.add_argument("--out", "-o", default="catchtheoffer-sample.json", help="Output JSON path.")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible data.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print the JSON output.")
    return parser


def main(argv: List[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.count < 1:
        print("--count must be at least 1", flush=True)
        return 1

    records = generate(args.count, seed=args.seed)
    with open(args.out, "w", encoding="utf-8") as handle:
        if args.pretty:
            json.dump(records, handle, indent=2)
        else:
            json.dump(records, handle)

    offers = sum(1 for r in records if r["status"] == "Offer Received")
    print(f"Generated {len(records)} mock application(s) -> {args.out}")
    print(f"  ({offers} offer(s); import via CatchTheOffer ▸ More ▸ Import data)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
