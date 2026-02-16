# Race Weekend CSV Workflow (Prime)

## Files to use each weekend
- `01_qualifying_results_mock.csv`
- `02_race_results_mock.csv`
- `03_qualifying_timing_mock.csv`
- `04_race_timing_mock.csv`

Copy these into new files per round (example: `2026-r02-qual-results.csv`) and replace the mock rows.

## Upload order
1. In `Weekly picks`, upload:
- `Qualifying results CSV`
- `Race results CSV`

2. Click `Import race weekend`.

3. Then upload:
- `Qualifying timing CSV`
- `Race timing CSV`

4. Click `Import timing data`.

## Minimum required columns

### Qualifying results (`01_...`)
Required:
- `season`
- `round`
- `driver` (or `driverId`)
- `position`

Optional:
- `q1_time`
- `q2_time`
- `q3_time`

### Race results (`02_...`)
Required:
- `season`
- `round`
- `driver` (or `driverId`)

At least one of:
- `position`
- `points`
- `fastest_lap_rank`
- `status`

Recommended:
- `grid`
- `laps`

### Qualifying timing (`03_...`)
Required:
- `season`
- `round`
- `driver` (or `driverId`)
- `stage` (`Q1`, `Q2`, or `Q3`)
- `attempt`
- `lap_time` (or `lap_time_ms`)

Optional:
- `is_deleted`
- `compound`

### Race timing (`04_...`)
Required:
- `season`
- `round`
- `driver` (or `driverId`)
- `lap`
- `lap_time` (or `lap_time_ms`)

Optional:
- `is_deleted`
- `stint`
- `compound`
- `position_start_lap`
- `position_end_lap`

## Notes
- Driver names can be plain names from your current grid (for example `Lando Norris`).
- Time format should be `m:ss.mmm` (always 3 decimals), or milliseconds (`lap_time_ms`).
- Keep one row per driver for results files.
- Keep one row per attempt/lap for timing files.
