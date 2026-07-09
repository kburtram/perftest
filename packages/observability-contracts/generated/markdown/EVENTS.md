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
| `import.linesSkipped` | event | instant | — | harness | system | sameProcessMonotonic | no | skipped:structuralMetadata, reason:safeEnum |
| `mssql.queryStudio.open.begin` | marker | begin | `mssql.queryStudio.open.end` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.open.end` | marker | end | `mssql.queryStudio.open.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | fromCache:structuralMetadata, monacoMs:structuralMetadata … |
| `mssql.queryStudio.connect.begin` | marker | begin | `mssql.queryStudio.connect.ready` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.connect.ready` | marker | end | `mssql.queryStudio.connect.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | backend:structuralMetadata, authKind:safeEnum, encrypted:structuralMetadata, metadataSession:structuralMetadata, error:structuralMetadata, reason:safeEnum … |
| `mssql.queryStudio.query.submit` | marker | begin | `mssql.queryStudio.query.complete` | queryStudio | extensionHost | sameProcessMonotonic | yes | scope:safeEnum, batchCount:structuralMetadata, selection:structuralMetadata, tuningDigest:structuralMetadata, tuningProfile:safeEnum … |
| `mssql.queryStudio.query.complete` | marker | end | `mssql.queryStudio.query.submit` | queryStudio | extensionHost | sameProcessMonotonic | yes | batches:structuralMetadata, resultSets:structuralMetadata, rows:structuralMetadata, errors:structuralMetadata, canceled:structuralMetadata, partial:structuralMetadata, bytes:structuralMetadata, pages:structuralMetadata, spillWrites:structuralMetadata, spillReads:structuralMetadata, appendMsTotal:structuralMetadata, spillWriteMsTotal:structuralMetadata, spillReadMsTotal:structuralMetadata, materializeMsTotal:structuralMetadata, windowCacheHits:structuralMetadata, windowCacheMisses:structuralMetadata … |
| `mssql.queryStudio.query.firstResult` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | msFromSubmit:structuralMetadata … |
| `mssql.queryStudio.resultsRendered` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | rows:structuralMetadata, resultSets:structuralMetadata, partial:structuralMetadata, fromSpill:structuralMetadata … |
| `mssql.queryStudio.rows.windowFetch.begin` | marker | begin | `mssql.queryStudio.rows.windowFetch.end` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.rows.windowFetch.end` | marker | end | `mssql.queryStudio.rows.windowFetch.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata, fromSpill:structuralMetadata, ms:structuralMetadata, cacheHit:structuralMetadata, materializedPages:structuralMetadata … |
| `mssql.queryStudio.rows.maxRowsPerResultSet` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | batchIndex:structuralMetadata, resultSetId:structuralMetadata, rowLimit:structuralMetadata, retainedRows:structuralMetadata … |
| `mssql.queryStudio.rows.append` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, rows:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.rows.spill.write` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.rows.spill.read` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.grid.window.request` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata … |
| `mssql.queryStudio.grid.window.received` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.grid.firstVisibleRowsPainted` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, rows:structuralMetadata, columns:structuralMetadata … |
| `mssql.queryStudio.messagesPrepared` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | messages:structuralMetadata, durationMs:structuralMetadata … |
| `mssql.queryStudio.messagesRendered` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | messages:structuralMetadata … |
| `mssql.queryStudio.cancel` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | msToAck:structuralMetadata, msToTerminal:structuralMetadata … |
| `queryStudio.sync.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `queryStudio.lsp.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `sqlDataPlane.*` | spanFamily | — | — | sqlDataPlane | extensionHost | sameProcessMonotonic | no |  … |
| `rpc.v2.*` | spanFamily | — | — | sqlDataPlane | extensionHost | sameProcessMonotonic | no |  … |
| `metadata.*` | spanFamily | — | — | metadata | extensionHost | sameProcessMonotonic | no |  … |
| `completions.*` | spanFamily | — | — | completions | extensionHost | sameProcessMonotonic | no |  … |
| `queryStudio.inlineCompletion.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `replay.*` | spanFamily | — | — | replay | extensionHost | sameProcessMonotonic | no |  … |
| `sqlLanguage.*` | spanFamily | — | — | sqlLanguage | extensionHost | sameProcessMonotonic | no |  … |
| `sqlScripting.*` | spanFamily | — | — | sqlLanguage | extensionHost | sameProcessMonotonic | no |  … |
| `queryStudio.languageService.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `settings.snapshot` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no | settingsFeature:safeEnum, keyCount:structuralMetadata … |
| `settings.changed` | event | instant | — | diagnostics | extensionHost | sameProcessMonotonic | no | settingsFeature:safeEnum, keyCount:structuralMetadata … |
| `queryStudio.runRecord.captured` | event | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | batches:structuralMetadata, resultSets:structuralMetadata, elevated:structuralMetadata, replay:structuralMetadata … |
| `metadataStore.*` | spanFamily | — | — | metadata | extensionHost | sameProcessMonotonic | no |  … |
| `metadataCache.*` | spanFamily | — | — | metadata | extensionHost | sameProcessMonotonic | no |  … |
| `mssql.metadata.cache.warmAcquire.begin` | marker | begin | `mssql.metadata.cache.warmAcquire.end` | metadata | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.metadata.cache.warmAcquire.end` | marker | end | `mssql.metadata.cache.warmAcquire.begin` | metadata | extensionHost | sameProcessMonotonic | yes | objects:structuralMetadata, waitedMs:structuralMetadata … |
| `objectExplorerV2.*` | spanFamily | — | — | objectExplorer | extensionHost | sameProcessMonotonic | no |  … |
| `centralObservability.*` | spanFamily | — | — | centralObservability | extensionHost | sameProcessMonotonic | no |  … |
| `mssql.central.preview.begin` | marker | begin | `mssql.central.preview.end` | centralObservability | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.central.preview.end` | marker | end | `mssql.central.preview.begin` | centralObservability | extensionHost | sameProcessMonotonic | yes | events:structuralMetadata, tables:structuralMetadata … |
| `mssql.central.upload.begin` | marker | begin | `mssql.central.upload.end` | centralObservability | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.central.upload.end` | marker | end | `mssql.central.upload.begin` | centralObservability | extensionHost | sameProcessMonotonic | yes | items:structuralMetadata, rows:structuralMetadata, outcome:structuralMetadata … |
| `mssql.central.provider.list.begin` | marker | begin | `mssql.central.provider.list.end` | centralObservability | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.central.provider.list.end` | marker | end | `mssql.central.provider.list.begin` | centralObservability | extensionHost | sameProcessMonotonic | yes | page:structuralMetadata, rowCount:structuralMetadata … |

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
| `mssql.queryStudio.open` | queryStudio | `mssql.queryStudio.open.begin` → `mssql.queryStudio.open.end` |
| `mssql.queryStudio.connect` | queryStudio | `mssql.queryStudio.connect.begin` → `mssql.queryStudio.connect.ready` |
| `mssql.queryStudio.query.toComplete` | queryStudio | `mssql.queryStudio.query.submit` → `mssql.queryStudio.query.complete` |
| `mssql.queryStudio.query.toRender` | queryStudio | `mssql.queryStudio.query.submit` → `mssql.queryStudio.resultsRendered` |

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
