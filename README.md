# 🎯 Internship Tracker

A single-file web app to track internship applications — the companies you've applied to, what you're still waiting to hear back on, deadlines, interview stages, offers, and follow-up actions.

**No install, no server, no build step.** Everything lives in one `index.html` file and your data is saved in your browser (localStorage).

## Live app

If GitHub Pages is enabled for this repo, open:

```
https://ryutaro-chan.github.io/internship-tracking/
```

Otherwise, just download `index.html` and double-click it.

## Features

- **9-stage status pipeline**: To Apply → Applied → OA / Assessment → HR Screen → Round 1 → Final → Offer → Rejected → Withdrawn (color-coded).
- **"Awaiting reply only" filter** — instantly see the roles you've applied to but haven't heard back on.
- **Deadline alerts** — cards highlight and show a countdown when a deadline is within 7 days.
- **Follow-up date tracking** — remember to chase recruiters after 2–3 weeks.
- **Full application detail** captured across 5 sections:
  1. Core info — company, role, target term, location & work type, status
  2. Logistics & dates — applied date, deadline, posting URL, follow-up date
  3. Process & interviews — OA/test date, interview dates, interviewer, stage notes
  4. Offer & decision — compensation, hours & duration, offer deadline, priority, pros/cons
  5. Extras & actions — referral/contact, resume/cover-letter version, next action item
- **Search** across company, role, location, and notes.
- **Sort** by last updated, deadline, applied date, or company.
- **Dashboard stats** — total, awaiting reply, offers, rejected.
- **Export / Import** your data as JSON for backup or moving between devices.

## Usage

1. Open the app (live link above, or open `index.html` locally).
2. Click **＋ Add Application** and fill in whatever you know — only Company and Role are required.
3. Use the filters and the **Awaiting reply only** checkbox to focus on what needs attention.
4. Click **⬇ Export** regularly to back up your data.

## Data & privacy

All data is stored locally in your browser via `localStorage`. Nothing is sent to any server. Clearing your browser data (or using a different browser/device) will not carry your entries over — use **Export/Import** to move data.
