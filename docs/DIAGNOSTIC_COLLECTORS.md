# Diagnostic collectors

The collector framework (design §14) lets diagnostic depth scale without ever
touching official numbers: collectors observe the rep lifecycle
(`validate → preLaunch → postLaunch → onProcessDiscovered →
onScenarioStart/End → preShutdown → postExit → normalize → teardown`), every
hook is fault-isolated (a throwing collector logs a warning and degrades), and
every collector metric is forced `official: false` by the normalizer —
structurally, not by convention.

Implementations: `packages/perftest-cli/src/collectors/`. Enablement is
per-config under `diagnostics`; pass-type and platform gating are declared on
each collector and enforced by the pipeline.

| Collector | Pass | What it produces | Requires |
|---|---|---|---|
| `processSampler` | measurement + diagnostic | `process-samples.jsonl`; `process.peakWorkingSet` / `process.cpuTime` per role (vscodeMain, extensionHost, sts) | nothing (PowerShell CIM / ps) |
| `stsEnvelopeJournal` | diagnostic | sts2 journal copies under `artifacts/sts2/`; `sts.rpc.<method>.duration` medians | local STS build + `STS_ENABLE_STS2=1` (see STS_INSTRUMENTATION.md) |
| `cdpExtHostProfile` | diagnostic | `artifacts/exthost.cpuprofile` (V8 sampling profile of the scenario window; open in VS Code/speedscope) | none — adds `--inspect-extensions=<port>` and drives the Node inspector protocol |
| `dotnetTrace` | diagnostic | `artifacts/sts.nettrace` (EventPipe cpu-sampling of STS; finalizes when STS exits at teardown) | `dotnet tool install -g dotnet-trace` |
| `wprEtw` | diagnostic | `artifacts/trace.etl` (system ETW, GeneralProfile, scenario window) | Windows Performance Toolkit + elevated session; warns + skips otherwise, and `wpr -cancel` on teardown guarantees no session leaks |

Planned next (§14.3): `cdpRendererTrace`/`cdpRendererProfile` (needs
`--remote-debugging-port` target discovery for the renderer), `otelMinimal`
(OTLP receiver), `sqlServerXEvents` (server-side timing; task packet 7),
`dotnetCounters` (needs a graceful-stop story for `dotnet-counters collect`
on Windows).

## Rules recap

- Measurement passes may run only `low`-cost, measurement-approved collectors
  (today: markers + processSampler). Everything else is diagnostic-only until
  a §12.3 overhead calibration says otherwise.
- A missing tool is a **validation warning** on the rep
  (`collector:dotnetTrace:dotnetTraceAvailable = warning`), never a failure
  and never a corrupted metric.
- Collector artifacts land under the rep's `artifacts/` dir with retention
  classes (`always` / `on-regression` / `on-failure`) honored by
  `perftest cleanup`.

## The full-diag config

`examples/config.fulldiag.local.jsonc` runs `query-10k-results` once with
every implemented collector enabled — the one-command "give me everything"
investigation pass. Its rep directory contains markers, process samples, the
ext-host CPU profile, the STS EventPipe trace, the sts2 envelope journal, and
(when elevated) the system ETL, all linked from report.html.
