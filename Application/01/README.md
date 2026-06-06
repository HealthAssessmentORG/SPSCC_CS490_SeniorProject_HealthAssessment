# Application 01 — Synthetic Assessment Data Generator

A terminal UI for generating and inserting synthetic health assessment response data into the SQL Server database. It uses a Python backend (`random_rows.py`) with the `faker` library to produce realistic field values, and an [Ink](https://github.com/vadimdemedes/ink)-based UI for interactive control.

## Usage

From the project root:

```bash
npm run ui:app1
```

## UI Walkthrough

### Step 1 — Connection check

On startup the app tests the SQL Server connection. If the connection fails, it reports the error. Fix the `APP2_DB_*` environment variables and relaunch.

### Step 2 — Choose a Screen

After a successful connection you are presented with two options:

```
> Open Data Filling Screen
  Open Data Viewing Screen
```

- **Data Filling Screen** — generate synthetic data and optionally insert it into the database.
- **Data Viewing Screen** — read-only browser for records already in the `ASSESSMENT` / `RESPONSE` tables.

Use **↑ / ↓** to move and **Enter** to confirm. Press **q** to quit.

---

### Data Filling Screen

This is the main workflow screen. It shows the current seed and assessment count at the top.

```
> Edit Seed
  Edit Assessment Count
  Generate Assessment(s)
  View/Edit Assessment  (disabled until an assessment is generated)
  Insert into Database
  Generate and Insert
  Exit
```

**Keys:** ↑ / ↓ to navigate · **Enter** to select · **b** to go back · **q** to quit

#### Typical workflow

1. *(Optional)* Select **Edit Seed** and type a positive integer, then press **Enter**.  
   A seed makes every run produce identical data. Leave the field blank and press **Enter** to clear it (random output).

2. *(Optional)* Select **Edit Assessment Count** and type how many assessments to generate, then press **Enter**.

3. Select **Generate Assessment(s)**.  
   The app runs `random_rows.py` in preview mode and stores the responses in memory. The status line shows how many responses were generated. **View/Edit Assessment** becomes available.

4. *(Optional)* Select **View/Edit Assessment** to inspect and change individual field values before writing to the database (see [Data Viewer](#data-viewer) below).

5. Select **Insert into Database** to write the in-memory responses to SQL Server, or go back to step 3 and use **Generate and Insert** to skip the preview step entirely.

---

### Data Viewer

Opened from **View/Edit Assessment** in the filling screen.

```
Response 3 of 120
Assessment #: 1
Field ID:     7
Field Name:   Email Address
Value:        alice@example.com
```

**Keys:**

| Key | Action |
|---|---|
| ← / ↑ | Previous response |
| → / ↓ | Next response |
| **e** | Enter edit mode for the current field value |
| **Enter** / **b** | Go back to the filling screen |
| **q** | Quit |

While editing (**e**): type freely, **Enter** to save, **Esc** to discard.

---

### Data Viewing Screen

A read-only view that loads existing assessments from the database. Navigate assessments and browse their responses. Press **b** or **Enter** to return to the screen chooser.

---

## Menu Options

| Option | Description |
|---|---|
| Edit Seed | Set a positive integer seed for reproducible output (blank = random) |
| Edit Assessment Count | Set how many assessments to generate |
| Generate Assessment(s) | Preview generated responses in memory without writing to the DB |
| View/Edit Assessment | Inspect and manually override individual field responses |
| Insert into Database | Write the current in-memory assessments to SQL Server |
| Generate and Insert | Generate and immediately insert in one step |
| Exit | Quit the application |

## Configuration

Application 01 shares the same database connection as Application 02. Set these environment variables (e.g. in `.env`):

```bash
APP2_DB_SERVER=localhost
APP2_DB_PORT=1433
APP2_DB_DATABASE=DD2975_PreDHA
APP2_DB_USER=cs490_app
APP2_DB_PASSWORD=yourpassword
APP2_DB_ENCRYPT=false
APP2_DB_TRUST_SERVER_CERTIFICATE=true
APP2_DB_REQUEST_TIMEOUT_MS=0
```

### Python

The app resolves a Python executable in this order:

1. `APP1_PYTHON` environment variable
2. `PYTHON` environment variable
3. `.venv/bin/python` (or `.venv\Scripts\python.exe` on Windows) if it exists
4. System `python3` / `python`

Install the required Python packages:

```bash
pip install faker mssql_python
```

Or activate the project virtual environment, which should already have them:

```bash
source .venv/bin/activate
```

## How It Works

`main.ts` spawns `random_rows.py` as a child process and communicates via environment variables and stdout JSON. The script supports three modes:

| Mode | Behavior |
|---|---|
| `faker` | Generate responses and return them as JSON (no DB writes) |
| `sql` | Print `INSERT` statements to stdout |
| `full` | Generate responses and insert them directly into SQL Server |

The database schema expected by the script:

- `dbo.FIELD` — field definitions (field_id, field_name)
- `dbo.DEPLOYER` — deployer records (dod_id)
- `dbo.ASSESSMENT` — assessment records
- `dbo.RESPONSE` — one row per field per assessment
- `dbo.RUN` — tracks each generation run
