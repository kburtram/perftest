# Observability Contract — Event Vocabulary

_Generated from registry obs-contract/1. Do not edit by hand._

## Events and span families

| Name / prefix | Kind | Phase | Pairs with | Feature | Roles | Timing | Measurable | Attrs (classified) |
|---|---|---|---|---|---|---|---|---|
| `mssql.activate.begin` | marker | begin | `mssql.activate.end` | activation | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.activate.end` | marker | end | `mssql.activate.begin` | activation | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.command.invoked` | marker | instant | — | shell | extensionHost | sameProcessMonotonic | no | commandId:structuralMetadata … |
| `mssql.connection.begin` | marker | begin | `mssql.connection.ready` | connection | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.connection.ready` | marker | end | `mssql.connection.begin` | connection | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.connection.failed` | marker | instant | — | connection | extensionHost | sameProcessMonotonic | no | reason:safeEnum … |
| `mssql.query.submit` | marker | begin | `mssql.query.complete` | query | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.query.complete` | marker | end | `mssql.query.submit` | query | extensionHost | sameProcessMonotonic | yes | rowCount:structuralMetadata, hasError:structuralMetadata … |
| `mssql.query.cancelRequested` | marker | instant | — | query | extensionHost | sameProcessMonotonic | no |  … |
| `mssql.query.cancelled` | marker | instant | — | query | extensionHost | sameProcessMonotonic | no |  … |
| `mssql.query.cancelFailed` | marker | instant | — | query | extensionHost | sameProcessMonotonic | no | reason:safeEnum … |
| `mssql.resultsGrid.windowFetch.begin` | marker | begin | `mssql.resultsGrid.windowFetch.end` | resultsGrid | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.resultsGrid.windowFetch.end` | marker | end | `mssql.resultsGrid.windowFetch.begin` | resultsGrid | extensionHost | sameProcessMonotonic | yes | rowStart:structuralMetadata, rowCount:structuralMetadata … |
| `mssql.resultsGrid.dataReceived` | marker | instant | — | resultsGrid | webview | sameProcessMonotonic | no |  … |
| `mssql.resultsGrid.renderComplete` | webviewMark | instant | — | resultsGrid | webview | epochAligned | yes | rowCount:structuralMetadata … |
| `mssql.sts.spawn.begin` | marker | begin | `mssql.sts.spawn.end` | stsLifecycle | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.sts.spawn.end` | marker | end | `mssql.sts.spawn.begin` | stsLifecycle | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.sts.ready` | marker | instant | — | stsLifecycle | extensionHost | sameProcessMonotonic | no |  … |
| `mssql.sts.pid` | event | instant | — | stsLifecycle | extensionHost | sameProcessMonotonic | no | pid:structuralMetadata … |
| `mssql.oe.expand.begin` | marker | begin | `mssql.oe.expand.end` | objectExplorer | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.oe.expand.end` | marker | end | `mssql.oe.expand.begin` | objectExplorer | extensionHost | sameProcessMonotonic | yes | childCount:structuralMetadata, nodeType:structuralMetadata … |
| `mssql.tableDesigner.init.begin` | marker | begin | `mssql.tableDesigner.init.end` | tableDesigner | extensionHost | sameProcessMonotonic | yes | isEdit:structuralMetadata … |
| `mssql.tableDesigner.init.end` | marker | end | `mssql.tableDesigner.init.begin` | tableDesigner | extensionHost | sameProcessMonotonic | yes | error:structuralMetadata, reason:safeEnum … |
| `mssql.tableDesigner.publish.begin` | marker | begin | `mssql.tableDesigner.publish.end` | tableDesigner | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.tableDesigner.publish.end` | marker | end | `mssql.tableDesigner.publish.begin` | tableDesigner | extensionHost | sameProcessMonotonic | yes | error:structuralMetadata, reason:safeEnum … |
| `mssql.schemaDesigner.init.begin` | marker | begin | `mssql.schemaDesigner.init.end` | schemaDesigner | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.schemaDesigner.init.end` | marker | end | `mssql.schemaDesigner.init.begin` | schemaDesigner | extensionHost | sameProcessMonotonic | yes | tableCount:structuralMetadata, error:structuralMetadata, reason:safeEnum … |
| `mssql.schemaCompare.compare.begin` | marker | begin | `mssql.schemaCompare.compare.end` | schemaCompare | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.schemaCompare.compare.end` | marker | end | `mssql.schemaCompare.compare.begin` | schemaCompare | extensionHost | sameProcessMonotonic | yes | differences:structuralMetadata, error:structuralMetadata … |
| `scenario.start` | marker | begin | `scenario.end` | harness | harness, extensionHost | sameProcessMonotonic | yes | scenarioId:structuralMetadata … |
| `scenario.end` | marker | end | `scenario.start` | harness | harness, extensionHost | sameProcessMonotonic | yes | status:safeEnum … |
| `system.rich.snapshot` | richMetric | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no | heapUsedMB:diagnosticMetric, rssMB:diagnosticMetric, eventLoopP95Ms:diagnosticMetric, cpuUserMs:diagnosticMetric, cpuSystemMs:diagnosticMetric … |
| `sessionDiag.enabled` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no | captureMode:safeEnum … |
| `sessionDiag.disabled` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no |  … |
| `sessionDiag.elevated` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no | durationMinutes:structuralMetadata … |
| `sessionDiag.elevation.expired` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no |  … |
| `selfTest.run.end` | event | instant | — | selfTest | extensionHost | sameProcessMonotonic | no | runStatus:safeEnum, passed:structuralMetadata, failed:structuralMetadata … |
| `rpc.*` | spanFamily | — | — | rpc | extensionHost | sameProcessMonotonic | no |  … |
| `webview.*` | spanFamily | — | — | webviewRpc | extensionHost, webview | sameProcessMonotonic | no |  … |
| `sts.dispatch.*` | spanFamily | — | — | stsDispatcher | sqlToolsService | epochAligned | no |  … |
| `sts.sql.*` | spanFamily | — | — | sqlDriver | sqlToolsService | epochAligned | no |  … |
| `sts.smo.*` | spanFamily | — | — | objectExplorer | sqlToolsService | epochAligned | no |  … |
| `sts.dacfx.*` | spanFamily | — | — | dacfx | sqlToolsService | epochAligned | no |  … |

## Derived metric names

| Metric | Feature | Derived from |
|---|---|---|
| `scenario.wallclock` | harness | `scenario.start` → `scenario.end` |
| `mssql.connection` | connection | `mssql.connection.begin` → `mssql.connection.ready` |
| `mssql.query.toComplete` | query | `mssql.query.submit` → `mssql.query.complete` |
| `mssql.query.toRender` | resultsGrid | `mssql.query.submit` → `mssql.resultsGrid.renderComplete` |
| `mssql.oe.expand` | objectExplorer | `mssql.oe.expand.begin` → `mssql.oe.expand.end` |
| `mssql.tableDesigner.init` | tableDesigner | `mssql.tableDesigner.init.begin` → `mssql.tableDesigner.init.end` |
| `mssql.schemaDesigner.init` | schemaDesigner | `mssql.schemaDesigner.init.begin` → `mssql.schemaDesigner.init.end` |

## Field classifications

| Classification | Default behavior |
|---|---|
| `secret` | never stored, never displayed, never exported — regardless of capture mode |
| `userSql` | digest by default; plaintext only under governed elevated capture, local-only |
| `resultData` | never captured by default; digest/governed only |
| `providerText` | sanitized safe code/enum by default — provider messages can embed SQL text and values and get NO error-string loophole |
| `identifierSensitive` | digest or redact unless explicitly safe |
| `structuralMetadata` | stored normally |
| `diagnosticMetric` | stored normally, bounded labels |
| `safeEnum` | stored normally — MUST be a closed enum, never free text |

## Timing classes

| Class | Meaning | Rendering | Eligibility |
|---|---|---|---|
| `sameProcessMonotonic` | Both endpoints from one process's monotonic clock. | solid bar | may feed measurement-eligible metrics |
| `epochAligned` | Endpoints aligned by wall clock across processes (e.g. STS spans in an extension-anchored waterfall). | hatched bar, labeled 'aligned diagnostic' | diagnostic-only, always |
| `derived` | Computed from other metrics via a declared derivation formula. | table value with derivation provenance | inherits the weakest input plane; requires a derivation block |
