# Local research preparation and mining

The application connects **Prepare & mine** and **Visualize** using a compact
top switcher. These are two full-page screens, not a graph embedded below the
preparation controls. Both use the existing visualization's colors, components,
and theme. It runs
only on this computer and retains normalized events so a population filter can
run a new mining job on **complete cases**, rather than filter aggregate rules.
The existing command-line preprocessing/mining and standalone CSV viewer remain
available.

## Launch on Windows

Use Python 3.11 in a virtual environment inside this worktree:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m mining_app.server
```

Open **http://127.0.0.1:8765**. To use another local port:

```powershell
.\.venv\Scripts\python.exe -m mining_app.server --port 8766
```

If `python` opens the Microsoft Store, select a real installed Python interpreter
or install Python before creating the environment. Do not expose this service
through a public port, tunnel, or reverse proxy. This is a single-user local
application, not an authenticated hosted service. Run one server per worktree.
Closing its terminal stops the service. Dependencies require network access
during installation; the browser application, graph libraries, and fonts do not
require third-party services at runtime.

For a configured package mirror that fails on optional `.whl.metadata` files,
the standard pip resolver can be retried without those downloads:

```powershell
.\.venv\Scripts\python.exe -m pip install --use-deprecated=legacy-resolver -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

This installation was verified with Python 3.11, pm4py 2.7.19.1 and Declare4Py
2.2.0. Transitive package versions are not locked; reinstallations should run
the checks below.

## Prepare a study

1. Upload a UTF-8 CSV, up to 20 MiB. Comma, semicolon, tab, and pipe delimiters
   are supported. Preview suggests a delimiter and attribute types and reports
   missing/distinct counts over the entire file. Malformed records are rejected.
2. Explicitly select one or more participant/group columns, an activity label, and a
   start timestamp. Optionally map an end time and an activity-category column.
   No semantic case/session identifier is guessed.
3. Choose how to split **each participant/group** into sequences: all events
   together, calendar days, inactivity sessions, or original behavioural days.
   Only the relevant settings are shown: a start hour for calendar days, or a
   gap threshold for inactivity sessions (default 60 minutes, measured from
   the latest preceding event end). Behavioural days require mapped end times.
   The page includes contextual explanations, hover tooltips and expandable help.
4. Choose attributes to retain and assign their types and scopes. String IDs
   retain leading zeros. Numbers must be finite; booleans accept true/false or
   1/0. Case attributes must be constant in a case; event attributes may change.
5. Explicitly choose missing/conflict handling and optional event exclusions or
   merging. Prepare, then inspect the population and data-quality counts.
6. Save/reuse the mapping locally or export/import a preparation-profile JSON.
   Imported profiles must match previewed columns and delimiter, and are
   validated again during preparation.

For the raw mobile sample:

```text
user_id;time_started;time_finished;app_id;category;wakefulnessId
3047;2021-05-28 00:00:00;2021-05-28 05:47:47;Screen off;Screen off;2
3047;2021-05-28 05:48:27;2021-05-28 05:48:41;com.mediatek.camera;Creativity;2
```

Map `app_id` to activity, `category` to activity category, and
`time_started`/`time_finished` to timestamps. **Decide what constitutes a case
before selecting `user_id`, `wakefulnessId`, or their combination.** Neither
column is intrinsically a case identifier; a wakefulness ID may repeat between
participants. This sample is a format illustration, not a recommended study
definition.

Normally group by participant ID. Add a session ID only if existing sessions
should remain separate; each distinct combination then has its own timeline.
Calendar and behavioural days split **within** those timelines, never across
participants. Age and gender usually belong under retained attributes for
cohort selection: grouping by them alone would pool different people's events
into an artificial sequence, not simply select a population.

### Preparation semantics

- Original activity labels and optional category labels are both retained.
  Labels containing `|`, `->`, or `;` are rejected because the compatible legacy
  rule CSV uses those as activity separators. Rename such labels in the source.
- ISO dates/times are required. Naive times retain the source clock.
  Timezone-aware times are converted to UTC. Mixed conventions are rejected.
  Calendar-day grouping uses that clock; standardize the source to the study's
  intended clock before preparing. Events are stably ordered by time/source row.
- Missing/invalid event values stop preparation by default. The explicit
  exclude option removes the **whole source group** containing such a record,
  before day/session splitting, so invalid timestamps cannot leave a truncated
  case. Missing case identifiers always stop preparation.
- Missing attributes can be retained as null; no age/gender/category is invented.
  A case mixing null and a value is a conflict, not “first row wins.”
  Conflicting case attributes stop preparation or exclude that complete case.
- Exact activity exclusions intentionally remove events before constructing
  sessions. Merging is disabled by default and only merges consecutive
  non-overlapping events with identical activity, category, and **all retained
  attributes**. Intervening activities and differing metadata are never lost.
- **Behavioural days (original algorithm)** directly reuses
  `preprocessing.day_split.assign_day_counter` separately for each selected
  participant/group. It considers gaps of at least 4 hours, prioritises gaps
  ending at 04:00-12:00, then uses nighttime (20:00-04:00, including 04:00
  boundaries within a gap) and late-sleep (03:00-10:00) fallbacks. It selects
  the longest candidate per date. Without a boundary, the timeline stays in one
  case. This estimates behavioural boundaries from gaps; it does not measure
  sleep, and a long event such as Screen off is not itself an inactivity gap.
  The app applies this algorithm after exclusions and before optional safe
  merging; it preserves attributes and creates unique group/segment IDs instead
  of using the legacy date-based case-ID builder. Algorithm settings/stage are
  saved in dataset metadata and exports. Both day methods use the normalized clock.
- Calendar/inactivity presets remain separate from the behavioural algorithm.
  The legacy preprocessing CLI is unchanged; its app-plus-URL activity-label
  builder is not automatically applied by this application.

## Mine and explore populations

Choose activities, activity categories, or both. “Both” runs the chosen engine
twice on the **same normalized complete-case cohort**, with separate labels and
outputs. Grouping or relabeling existing activity edges is not category mining.

Population controls derive from retained attribute names, types, and scopes.
Numeric bounds are inclusive. Multiple filters combine with AND.
Case attributes match the case value; event attributes explicitly match **any
event** or **all events**. All events of a matching case enter mining, even those
that did not individually match. Missingness has its own filter. Up to 500
distinct values are displayed per attribute; large numerical vocabularies can
use ranges. No-match cohorts produce an explanation, not an empty substitute
model.

Click **Apply cohort and mine** to submit a real background job. Editing controls
does not mutate saved results. The result screen says whether a saved model
matches the current dataset, population, settings, and pending mapping edits.
The graph's own rule/support/activity filters only narrow the displayed mined
model; they do not define a new population.

Enter a **Mined CSV file name** before mining. Use letters, digits, spaces,
hyphens, or underscores, optionally followed by `.csv`; do not enter a path or
a Windows-reserved name. A single-level run downloads exactly that CSV name.
For both levels, `my-study.csv` produces `my-study_activity.csv` and
`my-study_category.csv`. The name is recorded with the saved run and in model
metadata, and distinguishes named cache entries.

Completed files are available directly in the **Mined files** section. Choosing
**Visualize** passes the selected run, label level, dataset, and CSV source in
URL parameters; the viewer automatically loads the mined CSV. No export and
manual re-upload step is necessary. The full-page graph has only the compact
switcher, optional activity/category selector, original-file download link, and
theme control above it. Its existing toolbar can also download the currently
filtered constraints. The original-file link works even when rule filters
produce no displayed rows.

Switching back restores the prepared dataset, mapping/preview, population
controls, settings, selected file, and any in-progress job for that browser tab.
This draft context is held in local `sessionStorage`; original uploaded CSVs and
completed runs remain on the local backend. Both screens default to the original
dark visualization theme; an explicit theme choice survives screen switching.
The visualization does not need to contain the preparation controls;
it shares the same existing graph implementation and local data API.

Advanced settings choose DisCoveR or Declare4Py. Declare4Py itemset support must
be positive (default 0.1); the library rejects zero. DisCoveR's minimum support
is an engine activation-support threshold, not the exported rule satisfaction
support. The engines' confidence denominators differ:

| Exported metric | Meaning |
|---|---|
| Support | Cases without a violation / total cohort cases |
| DisCoveR confidence | Fulfilled activated traces / activated traces |
| Declare4Py confidence | Fulfilled event activations / event activations |

Do not reinterpret legacy uploaded metrics. The existing unified fields,
including `template`, `metrics_source`, and unary/binary constraint `category`,
are preserved. New model rows include `label_level`, `dataset_id`, `model_id`,
and `activity_categories`: a JSON array of category arrays, one for each
endpoint. An activity occurring in multiple categories exports **all categories
in the selected cohort**, not an arbitrary one. The graph details display these
sets separately from constraint arity. Demographics belong to retained events
and cohort metadata, never fictitious demographic fields on aggregate rules.

The existing viewer retains its per-source node-level AND and comparison
semantics, including isolated qualifying nodes and intentionally empty rule-type
selection. New model selection is connected through the local app; legacy CSV
uploads still work. A parameter-bound graph is restricted to the selected mined
artifact so it cannot silently substitute sample data. Opening Visualize without
a selected mined model still offers the standalone viewer's uploads and
comparisons. Old embedded-model URLs remain readable for compatibility.

## Persistence, exports, and errors

Private state lives under ignored `.mining-local`:

- `uploads`: cached original uploaded CSVs (including columns removed from
  normalized output).
- `datasets`: normalized `dataset.json`, `events.csv`, and preparation metadata.
- `profiles`: reusable named mapping configurations.
- `models`: job states, engine logs, input snapshots, separately mined model
  CSV/JSON, and model metadata.

The ZIP export includes normalized events, full case/attribute data, preparation
profile/schema/quality metadata, and completed model CSV/JSON plus model
metadata. Raw uploads are not exported. Case IDs encode the selected grouping
values, so exports may still be sensitive even if attributes were removed.
Treat exports as study data and do not commit them. Profile JSON may contain
study-specific column names and exclusions.

Cache identities include dataset content/preparation, label level, engine and
installed engine versions, thresholds, output name, and the exact cohort. Different cohorts
are mined separately. Only complete results are reused; failed jobs can be
retried. Models persist across normal restarts. Interrupted queued/running jobs
are marked failed on startup. One job runs at a time, with a one-hour limit and
visible queued/running/completed/failed states. A missing or failed engine never
falls back to sample data or pretends mining ran. Download the local engine log
from a failed job for diagnostic details. Legitimate zero-rule output still
writes a header-only CSV and empty JSON list.

Only application assets, explicitly selected model artifacts, and the two
bundled sample CSVs are served. Arbitrary repository/output/private files are
not exposed. Cross-origin API calls and writes are rejected; data is not sent
to third-party scripts. Local disk permissions remain those of the operating
system user. To remove a study, stop the server and remove its exact private
dataset/model/upload folders; this first version has no in-app deletion or ZIP
re-import.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s mining_app\tests -v
node --test .\visualization\tests\regression.test.mjs
```

Tests use synthetic temporary data, exercise both real engines, complete-case
filtering, conflicts/missingness, profiles, persistence, cache separation,
exports, empty results, string identifiers, and local API boundaries. Browser
verification should cover upload/mapping, invalid case selection, demographic
re-mining, required output naming, full-page automatic CSV loading,
activity/category switching, downloads from either screen, restored preparation
context, current/stale state, and graph loading.
