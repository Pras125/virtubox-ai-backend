# knowledge/ — extra sales material

Drop files here that the copilot should know but that aren't on the website, docs or Drive:
pricing guidelines, battle cards, case studies, FAQs, brochures, proposal templates.

Supported: `.md` `.txt` `.csv` `.pdf` `.png` `.jpg` `.jpeg` `.webp` (images are read by the Groq vision model).
Sub-folders are fine. This README is ignored.

After adding files: `npm run ingest:local` (or "Refresh knowledge → knowledge/ only" in the app as admin).
The running server picks up the new index automatically.

Tip: a short markdown file per topic works best, e.g. `objections.md`:

```
## "It's too expensive"
- Position on ROI: ...
- Mention: ...
```
