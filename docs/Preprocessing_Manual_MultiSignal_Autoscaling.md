# Preprocessing Manual
## Step-by-Step Guide: cluster-trace-microservices-v2021 → Feature Table

*Twelfth companion document. This is the manual, step-by-step version of the pipeline you'll eventually automate as `build_features.py` in `project/` — use it to run each stage by hand (in a Python REPL or notebook), inspect intermediate output, debug, or explain the pipeline in your report/viva. Every code snippet here is tested logic (see §17), ready to assemble into a script once you write one.*

---

## 0. Purpose

Once you write `build_features.py` in `project/` (following this manual), it will run the whole pipeline in one command. This manual exists for the times that isn't enough: understanding *why* each step exists, verifying intermediate output looks sane before trusting the final table, debugging a specific stage, or walking a teammate (or an examiner) through the logic. Follow it top to bottom the first time you build the pipeline; after that, use the resulting script for repeated runs.

---

## 1. Prerequisites

| Item | Status |
|---|---|
| `Node_0`, `MSRTQps_0`, `MSCallGraph_0`/`_1` extracted | Done |
| `MSResource_0` extracted | **Do this first — Section 2** |
| Python 3 + `pandas` installed | `pip install pandas` (numpy comes with it) |
| `pyarrow` (optional, for Parquet output) | `pip install pyarrow` — without it, save as CSV instead |

Run everything below from `DataSet01/clusterdata/cluster-trace-microservices-v2021/`.

---

## 2. Extract `MSResource_0`

```bash
cd data/MSResource
tar -xzf MSResource_0.tar.gz
```

**Verify:** `head -1 MSResource_0/MSResource_0.csv` should show the header `,msname,msinstanceid,nodeid,instance_cpu_usage,instance_memory_usage,timestamp` (corrected 2026-07-26 — an earlier draft of this manual listed `cpu_utilization,memory_utilization`, which doesn't match the actual extracted file; Section 7's code reads the real column names and renames them to `cpu_utilization`/`memory_utilization` for everything downstream). `wc -l MSResource_0/MSResource_0.csv` should show a large row count (millions).

---

## 3. Select Your Case-Study Microservice

**Why this matters:** you need one service with enough traffic for stable percentile estimates, and enough instances for Module 2's placement-event extraction later. Skipping this check is the single most common way this whole pipeline quietly produces garbage.

**Count calls per `dm` (as receiver) across `MSCallGraph`:**

```python
import pandas as pd

counts = {}
for path in ["data/MSCallGraph/MSCallGraph_0/MSCallGraph_0.csv",
             "data/MSCallGraph/MSCallGraph_1/MSCallGraph_1.csv"]:
    for chunk in pd.read_csv(path, usecols=["dm"], chunksize=1_000_000):
        vc = chunk["dm"].value_counts()
        for k, v in vc.items():
            if k in (None, "", "(?)"):
                continue
            counts[k] = counts.get(k, 0) + v

top_by_calls = pd.Series(counts).sort_values(ascending=False).head(20)
print(top_by_calls)
```

**Cross-check instance count in `MSResource`:**

```python
inst = {}
for chunk in pd.read_csv("data/MSResource/MSResource_0/MSResource_0.csv",
                          usecols=["msname", "msinstanceid"], chunksize=1_000_000):
    for msname, grp in chunk.groupby("msname")["msinstanceid"]:
        inst.setdefault(msname, set()).update(grp.unique())

top_by_instances = pd.Series({k: len(v) for k, v in inst.items()}).sort_values(ascending=False).head(20)
print(top_by_instances)
```

**Decision rule:** pick an `msname` that appears near the top of *both* lists. Assign it to a variable you'll reuse for every step below:

```python
MSNAME = "<the hash you picked>"
```

---

## 4. Three Schema Quirks to Understand Before Writing Any Feature Code

**4.1 — The `rt` sign convention.** For `rpc`/`http` calls, positive `rt` = recorded from the upstream (caller) side; negative `rt` = recorded from the downstream (callee, your target service) side. Since calls are logged twice — once per side, same `rpcid` — filtering to `rt < 0` gets you your service's own experienced latency without double-counting the paired row. `mq` calls carry no sign convention and are kept as-is.

**4.2 — `provider*` vs `consumer*` metrics in `MSRTQps`.** `provider*` = calls arriving *at* your service (inbound demand — what you want). `consumer*` = calls your service makes *outward* to its own dependencies (a different signal). Mixing them in corrupts the backlog feature.

**4.3 — Native granularity differs per table.** `Node` = 30s, `MSResource` = 60s, `MSCallGraph` = per-event (irregular). You'll resample everything onto one common bucket size (Section 5 onward uses 120s — coarser than every native rate, so you're aggregating down, never fabricating finer resolution than the data actually has).

---

## 5. Build the Latency Signal (p95/p99)

```python
BUCKET_SECONDS = 120
bucket_ms = BUCKET_SECONDS * 1000

cols = ["timestamp", "rpctype", "dm", "rt"]
matches = []
for path in ["data/MSCallGraph/MSCallGraph_0/MSCallGraph_0.csv",
             "data/MSCallGraph/MSCallGraph_1/MSCallGraph_1.csv"]:
    for chunk in pd.read_csv(path, usecols=cols, chunksize=500_000):
        subset = chunk[chunk["dm"] == MSNAME]
        if not subset.empty:
            matches.append(subset)
df_cg = pd.concat(matches, ignore_index=True)

keep = (df_cg["rt"] < 0) | (df_cg["rpctype"] == "mq")
df_cg = df_cg[keep].copy()
df_cg["rt"] = df_cg["rt"].abs()
df_cg["time_bucket"] = (df_cg["timestamp"] // bucket_ms).astype(int)

latency = df_cg.groupby("time_bucket")["rt"].agg(
    p95_latency_ms=lambda s: s.quantile(0.95),
    p99_latency_ms=lambda s: s.quantile(0.99),
    call_count="count",
).reset_index()
```

**Check before moving on:** `latency.describe()` — if `call_count` per bucket is mostly under ~10, your percentile estimates will be noisy; go back to Section 3 and pick a higher-traffic service, or widen `BUCKET_SECONDS`. Plot `p99_latency_ms` against `time_bucket` and look for visible spikes — this is your first real look at the trace's actual behavior.

---

## 6. Build the Load/Backlog Signal

```python
PROVIDER_METRICS = ["providerRPC_MCR", "providerRPC_RT", "HTTP_MCR", "HTTP_RT"]

cols = ["timestamp", "msname", "metric", "value"]
matches = []
for chunk in pd.read_csv("data/MSRTQps/MSRTQps_0/MSRTQps_0.csv", usecols=cols, chunksize=500_000):
    subset = chunk[chunk["msname"] == MSNAME]
    if not subset.empty:
        matches.append(subset)
df_qps = pd.concat(matches, ignore_index=True) if matches else pd.DataFrame(columns=cols)

df_qps = df_qps[df_qps["metric"].isin(PROVIDER_METRICS)].copy()
df_qps["time_bucket"] = (df_qps["timestamp"] // bucket_ms).astype(int)

load = df_qps.pivot_table(index="time_bucket", columns="metric", values="value", aggfunc="mean").reset_index()
load.columns.name = None
```

**Check:** `load.columns` — confirm you actually got at least one of the four provider metrics for your chosen service. If `load` is empty or missing columns, your service may not use RPC/HTTP as its primary paradigm (check `rpctype` distribution back in Section 5's data) — this is a real, useful thing to discover, not just an error to work around.

---

## 7. Build the Resource Signal

```python
cols = ["timestamp", "msname", "msinstanceid", "instance_cpu_usage", "instance_memory_usage"]
matches = []
for chunk in pd.read_csv("data/MSResource/MSResource_0/MSResource_0.csv", usecols=cols, chunksize=500_000):
    subset = chunk[chunk["msname"] == MSNAME]
    if not subset.empty:
        matches.append(subset)
df_res = pd.concat(matches, ignore_index=True)

df_res["time_bucket"] = (df_res["timestamp"] // bucket_ms).astype(int)
resource = df_res.groupby("time_bucket").agg(
    cpu_utilization=("instance_cpu_usage", "mean"),
    memory_utilization=("instance_memory_usage", "mean"),
    active_instances=("msinstanceid", "nunique"),
).reset_index()
```

**Check:** `resource["active_instances"].value_counts()` — if this is mostly 1, your chosen service barely scales in the trace, which limits what Module 2 can learn from it later (worth knowing now, not after you've built everything else).

---

## 8. Join the Three Signal Tables

```python
df = latency.merge(load, on="time_bucket", how="outer").merge(resource, on="time_bucket", how="outer")
df = df.sort_values("time_bucket").reset_index(drop=True)
```

**Check:** `df.shape` — row count should be close to (12 hours × 3600s) / `BUCKET_SECONDS` = 360 for 120s buckets, though gaps in any source table will produce a few missing buckets — that's expected, handled next.

---

## 9. Handle Gaps

```python
signal_cols = [c for c in df.columns if c != "time_bucket"]
df[signal_cols] = df[signal_cols].ffill(limit=2)
df = df.dropna(subset=["p99_latency_ms"]).reset_index(drop=True)
```

The `limit=2` matters: it forward-fills small gaps (one source briefly missing a bucket) but refuses to paper over a long stretch of genuinely missing data by repeating a stale value indefinitely. Rows still missing `p99_latency_ms` after this are dropped — you can't build a label without a latency reading.

---

## 10. Engineer Rolling-Delta Features

```python
exclude_from_deltas = {"call_count", "active_instances"}
for w in (1, 2, 4):
    for col in signal_cols:
        if col in exclude_from_deltas:
            continue
        df[f"{col}_delta{w}"] = df[col].diff(w)
```

These deltas exist because *rate of change* is often more predictive than the raw value — a signal climbing fast matters even before it crosses a threshold.

---

## 11. Construct the Label

```python
VIOLATION_PERCENTILE = 0.90
threshold = df["p99_latency_ms"].quantile(VIOLATION_PERCENTILE)
df["violation_now"] = (df["p99_latency_ms"] > threshold).astype(int)

df["label_next_violation"] = df["violation_now"].shift(-1)
df = df.dropna(subset=["label_next_violation"]).reset_index(drop=True)
df["label_next_violation"] = df["label_next_violation"].astype(int)
```

Two things to hold onto here: the threshold is **self-referential** (this service's own p99 distribution — the trace has no externally given SLA target, so this is the only defensible option, and you should say so exactly this way in your methodology). And the label is **forward-shifted** — row *t*'s label describes whether a violation happens at bucket *t+1*, not whether one is already happening at *t*. Get this backwards and you're training a model to detect the present, not predict the near future.

**Check:** `df["label_next_violation"].mean()` — should land somewhere well short of the two extremes (roughly 5–20% for a 90th-percentile threshold). A value near 0% or near 100% means something upstream is wrong — check `threshold` isn't degenerate (e.g., all-zero if your service has almost no traffic).

---

## 12. Time-Based Train/Test Split

```python
TRAIN_FRAC = 0.75
split_idx = int(len(df) * TRAIN_FRAC)
train, test = df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
```

Split by time position, never by random shuffling — a random split would leak adjacent-in-time correlation between train and test rows, inflating your apparent accuracy.

---

## 13. Run These Sanity Checks Every Time (Any Service, Any Bucket Size)

- `df.shape` — is the row count in the right ballpark for your bucket size?
- `df.isna().sum()` — anything unexpectedly missing after the gap-fill step?
- `df["label_next_violation"].mean()` — reasonable, not degenerate?
- `train["label_next_violation"].mean()` vs `test["label_next_violation"].mean()` — wildly different rates between the two halves is a warning sign (e.g., all your violations clustered in one time region) worth investigating before training anything.
- If you know (from your own inspection or from Section 5's plot) that the trace has a visible burst somewhere, check that the label actually goes positive right around it — this is the single most convincing sanity check you can run, and it's exactly how the script itself was validated before being handed to you.

---

## 14. Save the Output

```python
try:
    df.to_parquet("features.parquet", index=False)
except ImportError:
    df.to_csv("features.csv", index=False)
```

---

## 15. What Happens Next

This feature table is what Module 1 trains on directly (LightGBM + SHAP). Module 2 needs a *separate* pass over `MSResource` + `Node` for placement events — not this table (see `Full_Plan_MultiSignal_Autoscaling.md` §5). Module 3 needs Module 1's *held-out predictions*, which don't exist until after training — that's a downstream step, not part of preprocessing.

---

## 16. Troubleshooting

| Symptom | Likely Cause |
|---|---|
| Empty result after filtering `dm == MSNAME` | Wrong hash copied, or you filtered on `um` instead of `dm` (you want your service as *receiver*, not caller) |
| `load` table empty or missing expected columns | Service doesn't primarily use RPC/HTTP — check its `rpctype` distribution |
| Label is ~0% or ~100% positive | Threshold degenerate — check `call_count` per bucket isn't too sparse, or `VIOLATION_PERCENTILE` isn't set to something extreme like 0.999 |
| `active_instances` always 1 | Service barely scales in this trace — fine for Module 1, a real limitation to note for Module 2 |
| `ImportError` on `to_parquet` | `pip install pyarrow`, or just use the CSV fallback — no functional difference for downstream steps |

---

## 17. Relationship to `build_features.py`

Everything above is the exact logic to assemble into `build_features.py` once you write it in `project/` — same order, same code, just combined into one script with `select-candidates` and `build` subcommands. The step-by-step logic here was validated against synthetic data matching the real schema, with a deliberate latency/CPU burst injected: the resulting label correctly went positive one bucket *before* the injected spike, which is the early-detection behavior Sub-RQ 1 actually needs, not just a lagging readout of the spike itself. When you build the script, re-run that same test against your own synthetic fixture before trusting it on the real trace — if your script's output doesn't reproduce that early-detection behavior, the bug is in the script, not in the logic documented here.