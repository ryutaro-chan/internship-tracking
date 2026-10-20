# 🎯 CatchTheOffer

Track every internship application — the companies you've applied to, what
you're still waiting to hear back on, deadlines, interview stages, offers, and
follow-up actions — in a clean, adaptive web dashboard **plus** a Python CLI for
command-line analytics.

- **Web app** (`index.html` + `styles.css` + `app.js`): a responsive dashboard
  that renders as a full desktop layout on wide screens and a mobile iOS-style
  app on phones/tablets. No server or build step — data is saved in your
  browser (localStorage) and exportable as JSON/CSV.
- **Python CLI** (`tracker_cli.py` + `generate_sample_data.py`): analyze your
  JSON exports from the terminal — status distribution, conversion metrics,
  upcoming deadlines, and CSV reports.

## Live app

If GitHub Pages is enabled for this repo, open:

```
https://ryutaro-chan.github.io/internship-tracking/
```

Otherwise, download the three web files and open `index.html` in a browser.

## Web features

- **6-stage status pipeline**: Applied → Online Assessment / Test → Interview → Offer
  Received → Rejected → Withdrawn (soft glowing color pills).
- **Category tabs** — All Jobs · Tech & Software Engineering · Data Analytics &
  AI · Fintech & Payments · Product & Operations (auto-classified by role).
- **Feed & Kanban board** views with drag-and-drop status changes.
- **KPI dashboard** with a response-rate ring, plus an **Analytics** tab with a
  deadline calendar and status breakdown.
- **Compare Roles** — pick your Singapore institution (IHL) and course, and get
  course-aware "best fit" scoring with alignment tags.
- **Company logos** fetched dynamically (Clearbit → Google favicon → initials).
- **Sort** by last updated, deadline, date applied, **stipend (high→low)**, or
  company.
- **Export/Import JSON** and **Export to CSV**, follow-up email generator, and
  bookmarking.

## Python CLI

The web app is fully client-side; these scripts are a standard-library-only
companion (**Python 3.8+**, no `pip install` needed) for analyzing the JSON you
export from the app.

### Quick start

```bash
# 1. Generate realistic mock data to experiment with
python generate_sample_data.py --count 20 --seed 42

# 2. Summarize your job search (auto-detects the newest catchtheoffer-*.json)
python tracker_cli.py --summary
```

### `tracker_cli.py` — analytics & reporting

Loads a CatchTheOffer JSON export (via `--file`, or auto-detected from the
current folder) and reports on it.

```bash
python tracker_cli.py --summary                 # full job-search summary
python tracker_cli.py --summary --file my.json  # use a specific export
python tracker_cli.py --deadlines --within 14   # deadlines in the next 14 days
python tracker_cli.py --export-csv report.csv   # write a formatted CSV report
python tracker_cli.py --json                    # machine-readable JSON summary
```

`--summary` prints totals, conversion metrics (response / interview / offer
rates), a status-distribution bar chart, category breakdown, average monthly
stipend, and upcoming deadlines. It's powered by the `InternshipAnalytics`
class, which you can also import and use programmatically:

```python
from tracker_cli import InternshipAnalytics

engine = InternshipAnalytics.from_file("catchtheoffer-2026-10-20.json")
print(engine.conversion_metrics())
print(engine.status_distribution())
engine.export_csv("report.csv")
```

### `generate_sample_data.py` — mock data

Creates a JSON file in the exact shape the web app imports, so you can populate
the dashboard (**More ▸ Import data**) or feed `tracker_cli.py` for testing.

```bash
python generate_sample_data.py                      # 12 records -> catchtheoffer-sample.json
python generate_sample_data.py --count 30           # 30 records
python generate_sample_data.py --out demo.json --seed 7 --pretty
```

Each record includes a company, role, category, status, application date,
deadline, monthly stipend, and stage-appropriate notes.

### Typical workflow

1. In the web app, go to **More ▸ Export data (JSON)** to download your
   applications.
2. Put the JSON next to these scripts (or pass it with `--file`).
3. Run `python tracker_cli.py --summary` for a terminal dashboard, or
   `--export-csv` to hand off a spreadsheet.

## Data & privacy

All web data is stored locally in your browser via `localStorage` — nothing is
sent to any server (company logos are the one exception: they load from public
logo services). Use **Export/Import** to back up or move data between devices,
and the Python CLI to analyze those exports offline.
