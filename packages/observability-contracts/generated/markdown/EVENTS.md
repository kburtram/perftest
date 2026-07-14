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
| `sts2.query.stats` | event | instant | — | queryStudio | sqlToolsService | epochAligned | no | status:safeEnum, pagesSent:structuralMetadata, pages:structuralMetadata, rows:structuralMetadata, cellSlots:structuralMetadata, nullCells:structuralMetadata, encodedBytes:structuralMetadata, eventPayloadBytes:structuralMetadata, maxEventPayloadBytes:structuralMetadata, readMsTotal:structuralMetadata, creditWaitMsTotal:structuralMetadata, encodeMsTotal:structuralMetadata, rowsSerializeMsTotal:structuralMetadata, utf8MeasureMsTotal:structuralMetadata, nullBitmapMsTotal:structuralMetadata, pageBodyBuildMsTotal:structuralMetadata, eventBuildMsTotal:structuralMetadata, postBuildMsTotal:structuralMetadata, postMsTotal:structuralMetadata, encodePrepAllocatedBytes:structuralMetadata, eventBuildAllocatedBytes:structuralMetadata, postBuildAllocatedBytes:structuralMetadata … |
| `sts2.query.coordinator.stats` | event | instant | — | queryStudio | sqlToolsService | epochAligned | no | status:safeEnum, pages:structuralMetadata, captureCanonicalBytes:structuralMetadata, queueWaitMsTotal:structuralMetadata, captureMsTotal:structuralMetadata, captureAllocatedBytes:structuralMetadata, inputEnvelopeBuildMsTotal:structuralMetadata, inputEnvelopeBuildAllocatedBytes:structuralMetadata, inputJournalMsTotal:structuralMetadata, coreMsTotal:structuralMetadata, coreAllocatedBytes:structuralMetadata, outputEncodeMsTotal:structuralMetadata, outputEncodeAllocatedBytes:structuralMetadata, outputEnvelopeBuildMsTotal:structuralMetadata, outputEnvelopeBuildAllocatedBytes:structuralMetadata, outputJournalMsTotal:structuralMetadata, outputActionMsTotal:structuralMetadata, outputActionAllocatedBytes:structuralMetadata, outputSubstitutionMsTotal:structuralMetadata, outputSubstitutionAllocatedBytes:structuralMetadata, outputGatewayEmitMsTotal:structuralMetadata, outputGatewayEmitAllocatedBytes:structuralMetadata … |
| `import.linesSkipped` | event | instant | — | harness | system | sameProcessMonotonic | no | skipped:structuralMetadata, reason:safeEnum |
| `mssql.queryStudio.open.begin` | marker | begin | `mssql.queryStudio.open.end` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.open.end` | marker | end | `mssql.queryStudio.open.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | fromCache:structuralMetadata, monacoMs:structuralMetadata … |
| `mssql.queryStudio.connect.begin` | marker | begin | `mssql.queryStudio.connect.ready` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.connect.ready` | marker | end | `mssql.queryStudio.connect.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | backend:structuralMetadata, authKind:safeEnum, encrypted:structuralMetadata, metadataSession:structuralMetadata, error:structuralMetadata, reason:safeEnum … |
| `mssql.queryStudio.query.submit` | marker | begin | `mssql.queryStudio.query.complete` | queryStudio | extensionHost | sameProcessMonotonic | yes | backend:safeEnum, scope:safeEnum, batchCount:structuralMetadata, selection:structuralMetadata, tuningDigest:structuralMetadata, tuningProfile:safeEnum … |
| `mssql.queryStudio.query.complete` | marker | end | `mssql.queryStudio.query.submit` | queryStudio | extensionHost | sameProcessMonotonic | yes | backend:safeEnum, status:safeEnum, durationMs:structuralMetadata, batches:structuralMetadata, resultSets:structuralMetadata, rows:structuralMetadata, errors:structuralMetadata, canceled:structuralMetadata, partial:structuralMetadata, bytes:structuralMetadata, pages:structuralMetadata, spillWrites:structuralMetadata, spillReads:structuralMetadata, spillEncoding:safeEnum, appendMsTotal:structuralMetadata, spillWriteMsTotal:structuralMetadata, spillSerializeMsTotal:structuralMetadata, spillWriteIoMsTotal:structuralMetadata, spillReadMsTotal:structuralMetadata, spillDeserializeMsTotal:structuralMetadata, materializeMsTotal:structuralMetadata, windowCacheHits:structuralMetadata, windowCacheMisses:structuralMetadata, residentPageBytes:structuralMetadata, memoryBytesPeak:structuralMetadata, pendingSpillBytesPeak:structuralMetadata, windowCacheBytes:structuralMetadata, windowCachePeakBytes:structuralMetadata, windowCacheEvictions:structuralMetadata, windowCacheBypasses:structuralMetadata, windowCacheOversizeSkips:structuralMetadata, windowCacheMaxBytes:structuralMetadata … |
| `mssql.queryStudio.query.firstResult` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | backend:safeEnum, pageRows:structuralMetadata, msFromSubmit:structuralMetadata |
| `mssql.queryStudio.query.firstPage` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | yes | backend:safeEnum, pageRows:structuralMetadata, msFromSubmit:structuralMetadata |
| `mssql.queryStudio.resultsRendered` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | rows:structuralMetadata, resultSets:structuralMetadata, activeTab:safeEnum, partial:structuralMetadata, fromSpill:structuralMetadata … |
| `mssql.queryStudio.boot.scriptStart` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.reactMount` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.monacoReady` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.editorInteractive` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | fromCache:structuralMetadata … |
| `mssql.queryStudio.boot.gridChunkRequested` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.gridChunkLoaded` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | waitedForByRender:structuralMetadata … |
| `mssql.queryStudio.boot.planChunkLoaded` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.vectorChunkRequested` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.boot.vectorChunkLoaded` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | waitedForByRender:structuralMetadata … |
| `mssql.queryStudio.boot.spatialChunkRequested` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | — |
| `mssql.queryStudio.boot.spatialChunkLoaded` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes | waitedForByRender:structuralMetadata |
| `mssql.queryStudio.boot.autoRunStart` | webviewMark | instant | — | queryStudio | webview | epochAligned | yes |  … |
| `mssql.queryStudio.sqlcmd.toggle` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | enabled:structuralMetadata, source:safeEnum |
| `mssql.queryStudio.sqlcmd.run` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | yes | steps:structuralMetadata, batches:structuralMetadata, setvars:structuralMetadata, includes:structuralMetadata, connects:structuralMetadata, onError:safeEnum, errorCode:safeEnum, preprocessMs:structuralMetadata |
| `mssql.queryStudio.scan.run` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | yes | rules:structuralMetadata, matched:structuralMetadata, sampledLines:structuralMetadata, ms:structuralMetadata, action:safeEnum |
| `mssql.queryStudio.rows.windowFetch.begin` | marker | begin | `mssql.queryStudio.rows.windowFetch.end` | queryStudio | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryStudio.rows.windowFetch.end` | marker | end | `mssql.queryStudio.rows.windowFetch.begin` | queryStudio | extensionHost | sameProcessMonotonic | yes | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata, fromSpill:structuralMetadata, ms:structuralMetadata, cacheHit:structuralMetadata, materializedPages:structuralMetadata, residentPageBytes:structuralMetadata, pendingSpillBytes:structuralMetadata, windowCacheBytes:structuralMetadata, windowCacheEntries:structuralMetadata, windowCacheEvictions:structuralMetadata, windowCacheBypasses:structuralMetadata, windowCacheOversizeSkips:structuralMetadata, windowCacheMaxBytes:structuralMetadata, gridPreview:structuralMetadata, sourceValueCharacters:structuralMetadata, returnedValueCharacters:structuralMetadata … |
| `mssql.queryStudio.state.push` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | executionKind:safeEnum, intervalMs:structuralMetadata, buildMs:structuralMetadata, resultSets:structuralMetadata, columns:structuralMetadata, rows:structuralMetadata, messages:structuralMetadata, payloadChars:structuralMetadata … |
| `mssql.queryStudio.rows.maxRowsPerResultSet` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | batchIndex:structuralMetadata, resultSetId:structuralMetadata, rowLimit:structuralMetadata, retainedRows:structuralMetadata … |
| `mssql.queryStudio.rows.append` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, rows:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.rows.spill.write` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata, serializeMs:structuralMetadata, ioMs:structuralMetadata, encoding:safeEnum … |
| `mssql.queryStudio.rows.spill.read` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | resultSetId:structuralMetadata, bytes:structuralMetadata, ms:structuralMetadata, ioMs:structuralMetadata, deserializeMs:structuralMetadata, encoding:safeEnum … |
| `mssql.queryStudio.grid.window.request` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata, columnStart:structuralMetadata, columnCount:structuralMetadata, totalColumns:structuralMetadata, requestedCells:structuralMetadata, projected:structuralMetadata |
| `mssql.queryStudio.grid.window.received` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, start:structuralMetadata, count:structuralMetadata, columnStart:structuralMetadata, columnCount:structuralMetadata, totalColumns:structuralMetadata, returnedRows:structuralMetadata, returnedColumns:structuralMetadata, returnedCells:structuralMetadata, valueMode:safeEnum, projected:structuralMetadata, ms:structuralMetadata |
| `mssql.queryStudio.grid.copy.begin` | webviewMark | begin | `mssql.queryStudio.grid.copy.end` | queryStudio | webview | epochAligned | yes | resultSetId:structuralMetadata, ranges:structuralMetadata, resultRows:structuralMetadata, resultColumns:structuralMetadata, includeHeaders:structuralMetadata |
| `mssql.queryStudio.grid.copy.end` | webviewMark | end | `mssql.queryStudio.grid.copy.begin` | queryStudio | webview | epochAligned | yes | resultSetId:structuralMetadata, outcome:safeEnum, rpcRequests:structuralMetadata, characters:structuralMetadata, durationMs:structuralMetadata, planMs:structuralMetadata, fetchDecodeMs:structuralMetadata, formatMs:structuralMetadata, clipboardMs:structuralMetadata, clipboardAttempts:structuralMetadata, clipboardMode:safeEnum, windowRows:structuralMetadata, rows:structuralMetadata, columns:structuralMetadata, cells:structuralMetadata, reason:safeEnum … |
| `mssql.queryStudio.grid.firstVisibleRowsPainted` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, rows:structuralMetadata, columns:structuralMetadata, fetchedColumns:structuralMetadata, projected:structuralMetadata … |
| `mssql.queryStudio.results.block.visibility` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, mounted:structuralMetadata, reason:safeEnum |
| `mssql.queryStudio.run.observed` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | executionKind:safeEnum, generationChanged:structuralMetadata, terminal:structuralMetadata, resultSets:structuralMetadata, rows:structuralMetadata … |
| `mssql.queryStudio.tab.activation.begin` | webviewMark | begin | `mssql.queryStudio.tab.activation.end` | queryStudio | webview | epochAligned | no | from:safeEnum, to:safeEnum, source:safeEnum, mountedBefore:structuralMetadata, requestId:structuralMetadata … |
| `mssql.queryStudio.tab.activation.end` | webviewMark | end | `mssql.queryStudio.tab.activation.begin` | queryStudio | webview | epochAligned | no | from:safeEnum, to:safeEnum, source:safeEnum, mountedBefore:structuralMetadata, requestId:structuralMetadata, rafThrottled:structuralMetadata … |
| `mssql.queryStudio.interaction.begin` | webviewMark | begin | `mssql.queryStudio.interaction.end` | queryStudio | webview | epochAligned | no | requestId:structuralMetadata, action:safeEnum, axis:safeEnum, target:safeEnum, resultSetIndex:structuralMetadata, steps:structuralMetadata, includeHeaders:structuralMetadata … |
| `mssql.queryStudio.interaction.end` | webviewMark | end | `mssql.queryStudio.interaction.begin` | queryStudio | webview | epochAligned | no | requestId:structuralMetadata, action:safeEnum, axis:safeEnum, target:safeEnum, resultSetIndex:structuralMetadata, steps:structuralMetadata, includeHeaders:structuralMetadata, outcome:safeEnum, rafThrottled:structuralMetadata … |
| `mssql.queryStudio.webview.health` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | checkpoint:safeEnum, longTaskCount:structuralMetadata, longTaskTotalMs:structuralMetadata, longestTaskMs:structuralMetadata, gridInstances:structuralMetadata, mountedTabs:structuralMetadata, domNodes:structuralMetadata, usedJsHeapBytes:structuralMetadata, totalJsHeapBytes:structuralMetadata, jsHeapLimitBytes:structuralMetadata, rafThrottled:structuralMetadata |
| `mssql.queryStudio.grid.instance.created` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, rows:structuralMetadata, columns:structuralMetadata … |
| `mssql.queryStudio.grid.instance.disposed` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata … |
| `mssql.queryStudio.grid.render.complete` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | resultSetId:structuralMetadata, rows:structuralMetadata, columns:structuralMetadata, fetchedColumns:structuralMetadata, projected:structuralMetadata, msFromWindowReceived:structuralMetadata … |
| `mssql.queryStudio.export.begin` | marker | begin | `mssql.queryStudio.export.end` | queryStudio | extensionHost | sameProcessMonotonic | no | format:safeEnum, rows:structuralMetadata … |
| `mssql.queryStudio.export.end` | marker | end | `mssql.queryStudio.export.begin` | queryStudio | extensionHost | sameProcessMonotonic | no | format:safeEnum, rows:structuralMetadata, bytes:structuralMetadata, canceled:structuralMetadata, streamed:structuralMetadata … |
| `mssql.queryStudio.textView.capped` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | totalRows:structuralMetadata, renderedRows:structuralMetadata … |
| `mssql.queryStudio.plan.parse` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | plans:structuralMetadata, cacheHit:structuralMetadata, ms:structuralMetadata … |
| `mssql.queryStudio.messagesPrepared` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | messages:structuralMetadata, visibleRows:structuralMetadata, durationMs:structuralMetadata … |
| `mssql.queryStudio.messages.window` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | startIndex:structuralMetadata, nextIndex:structuralMetadata, returned:structuralMetadata, total:structuralMetadata, textCharacters:structuralMetadata, hasMore:structuralMetadata, durationMs:structuralMetadata |
| `mssql.queryStudio.messagesRendered` | webviewMark | instant | — | queryStudio | webview | epochAligned | no | messages:structuralMetadata … |
| `mssql.queryStudio.cancel` | marker | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | msToAck:structuralMetadata, msToTerminal:structuralMetadata … |
| `queryStudio.sync.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `queryStudio.lsp.*` | spanFamily | — | — | queryStudio | extensionHost | sameProcessMonotonic | no |  … |
| `sqlDataPlane.tsNative.query.terminal` | marker | instant | — | sqlDataPlane | extensionHost | sameProcessMonotonic | no | queryStatus:safeEnum, resultSets:structuralMetadata, rows:structuralMetadata, pages:structuralMetadata, driverEvents:structuralMetadata, logicalEncodedBytes:structuralMetadata, encodeMsTotal:structuralMetadata, sinkWaitMsTotal:structuralMetadata, pauseMsBackpressure:structuralMetadata, pauseMsCpuYield:structuralMetadata, yields:structuralMetadata, maxSynchronousSliceMs:structuralMetadata, firstMetadataMs:structuralMetadata, firstPageProducedMs:structuralMetadata, firstPageAcceptedMs:structuralMetadata, outcomeCertainty:safeEnum, errorCode:safeEnum, diag:structuralMetadata, durationMs:structuralMetadata |
| `sqlDataPlane.*` | spanFamily | — | — | sqlDataPlane | extensionHost | sameProcessMonotonic | no |  … |
| `sqlDataPlane.auth.token.*` | spanFamily | — | — | sqlDataPlane | extensionHost | sameProcessMonotonic | no | authKind:safeEnum, hasAccountId:structuralMetadata, hasTenantId:structuralMetadata, hasAccountLabel:structuralMetadata, result:safeEnum, expiryBucket:safeEnum, errorClass:safeEnum, diag:structuralMetadata, durationMs:structuralMetadata |
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
| `queryStudio.saveAs.adopted` | event | instant | — | queryStudio | extensionHost | sameProcessMonotonic | no | extension:safeEnum, reopened:structuralMetadata, orphansClosed:structuralMetadata, transplantPending:structuralMetadata … |
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
| `mssql.queryResults.snapshot.create.begin` | marker | begin | `mssql.queryResults.snapshot.create.end` | queryResults | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryResults.snapshot.create.end` | marker | end | `mssql.queryResults.snapshot.create.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | resultSetCount:structuralMetadata, totalRows:structuralMetadata, ownerKind:safeEnum, purpose:safeEnum, scanFree:safeEnum |
| `mssql.queryResults.snapshot.acquire` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | ownerKind:safeEnum, leaseCount:structuralMetadata |
| `mssql.queryResults.snapshot.release` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | reason:safeEnum, leaseCount:structuralMetadata |
| `mssql.queryResults.snapshot.dispose` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | reason:safeEnum, ageMs:diagnosticMetric, storeDisposed:safeEnum |
| `mssql.queryResults.snapshot.retentionSweep` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | trigger:safeEnum, swept:structuralMetadata, expired:structuralMetadata, snapshots:structuralMetadata, retainedStores:structuralMetadata |
| `mssql.queryResults.store.demote` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | reason:safeEnum, targetBytes:structuralMetadata, memoryBytesBefore:diagnosticMetric |
| `mssql.queryResults.grant.minted` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | operationClass:safeEnum |
| `mssql.queryResults.grant.denied` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | operationClass:safeEnum, reason:safeEnum |
| `mssql.queryResults.aiTool.invoke.begin` | marker | begin | `mssql.queryResults.aiTool.invoke.end` | queryResults | extensionHost | sameProcessMonotonic | yes | operation:safeEnum |
| `mssql.queryResults.aiTool.invoke.end` | marker | end | `mssql.queryResults.aiTool.invoke.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | operation:safeEnum, outcome:safeEnum |
| `mssql.queryResults.transform.evaluate.begin` | marker | begin | `mssql.queryResults.transform.evaluate.end` | queryResults | extensionHost | sameProcessMonotonic | yes | terminalKind:safeEnum, opCount:structuralMetadata, specDigest:structuralMetadata |
| `mssql.queryResults.transform.evaluate.end` | marker | end | `mssql.queryResults.transform.evaluate.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | terminalKind:safeEnum, opCount:structuralMetadata, specDigest:structuralMetadata, rowsScanned:diagnosticMetric, rowsMatched:diagnosticMetric, partial:safeEnum, partialReason:safeEnum, outputRows:structuralMetadata, outputClass:safeEnum, ms:diagnosticMetric |
| `mssql.queryResults.derive.begin` | marker | begin | `mssql.queryResults.derive.end` | queryResults | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryResults.derive.end` | marker | end | `mssql.queryResults.derive.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | specDigest:structuralMetadata, derivedRows:structuralMetadata, rowsScanned:diagnosticMetric, fromDerived:safeEnum |
| `mssql.queryResults.context.update` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | sourceKind:safeEnum, reason:safeEnum, hasSelection:safeEnum, selectedCells:structuralMetadata |
| `mssql.queryResults.pin.open.begin` | marker | begin | `mssql.queryResults.pin.open.end` | queryResults | extensionHost | sameProcessMonotonic | yes |  … |
| `mssql.queryResults.pin.open.end` | marker | end | `mssql.queryResults.pin.open.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | expired:safeEnum, resultSetCount:structuralMetadata |
| `mssql.queryResults.pin.rendered` | webviewMark | instant | — | queryResults | webview | epochAligned | yes | resultSets:structuralMetadata, rows:structuralMetadata |
| `mssql.queryResults.pin.close` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | expired:safeEnum |
| `mssql.queryResults.spill.orphanSweep` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | dirsRemoved:structuralMetadata, bytesRemoved:diagnosticMetric, failures:structuralMetadata |
| `mssql.queryResults.vector.ingest` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | phase:safeEnum, totalRows:diagnosticMetric, rows:diagnosticMetric, dimensions:diagnosticMetric, packedBytes:diagnosticMetric, scannedBytes:diagnosticMetric, rowsScanned:diagnosticMetric, nulls:diagnosticMetric, unavailable:diagnosticMetric, transport:safeEnum, partialReason:safeEnum |
| `mssql.queryResults.vector.analysis.begin` | marker | begin | `mssql.queryResults.vector.analysis.end` | queryResults | extensionHost | sameProcessMonotonic | yes | totalBudgetMs:diagnosticMetric |
| `mssql.queryResults.vector.analysis.end` | marker | end | `mssql.queryResults.vector.analysis.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | outcome:safeEnum, rows:diagnosticMetric, dimensions:diagnosticMetric, findings:diagnosticMetric, partialTime:safeEnum, workerMs:diagnosticMetric, ms:diagnosticMetric |
| `mssql.queryResults.vector.analysis.cancel` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | — |
| `mssql.queryResults.vector.worker.end` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | operation:safeEnum, outcome:safeEnum, rows:diagnosticMetric, dimensions:diagnosticMetric, partialTime:safeEnum, ms:diagnosticMetric |
| `mssql.queryResults.vector.model.end` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | outcome:safeEnum, dims:diagnosticMetric, ms:diagnosticMetric |
| `mssql.queryResults.vector.search.end` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | outcome:safeEnum, k:diagnosticMetric, exactMs:diagnosticMetric, approxMs:diagnosticMetric, approxIncluded:safeEnum, ms:diagnosticMetric |
| `mssql.queryResults.vector.render.begin` | webviewMark | begin | `mssql.queryResults.vector.render.firstPaint` | queryResults | webview | epochAligned | yes |  … |
| `mssql.queryResults.vector.render.firstPaint` | webviewMark | end | `mssql.queryResults.vector.render.begin` | queryResults | webview | epochAligned | yes |  … |
| `mssql.queryResults.spatial.prepare.begin` | marker | begin | `mssql.queryResults.spatial.prepare.end` | queryResults | extensionHost | sameProcessMonotonic | yes | sourceMode:safeEnum, rowBudget:diagnosticMetric, payloadBudgetBytes:diagnosticMetric |
| `mssql.queryResults.spatial.prepare.end` | marker | end | `mssql.queryResults.spatial.prepare.begin` | queryResults | extensionHost | sameProcessMonotonic | yes | outcome:safeEnum, sourceRowsScanned:diagnosticMetric, candidateCells:diagnosticMetric, nullCells:diagnosticMetric, transportUnavailableCells:diagnosticMetric, payloadBytes:diagnosticMetric, partial:safeEnum, partialReason:safeEnum, ms:diagnosticMetric |
| `mssql.queryResults.spatial.prepare.cancel` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | reason:safeEnum, sourceRowsScanned:diagnosticMetric |
| `mssql.queryResults.spatial.chunk.end` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | sequence:structuralMetadata, sourceRowsScanned:diagnosticMetric, features:diagnosticMetric, payloadBytes:diagnosticMetric, done:safeEnum, ms:diagnosticMetric |
| `mssql.queryResults.spatial.decode.begin` | webviewMark | begin | `mssql.queryResults.spatial.decode.end` | queryResults | webview | epochAligned | yes | mode:safeEnum |
| `mssql.queryResults.spatial.decode.end` | webviewMark | end | `mssql.queryResults.spatial.decode.begin` | queryResults | webview | epochAligned | yes | outcome:safeEnum, features:diagnosticMetric, vertices:diagnosticMetric, skipped:diagnosticMetric, derivedBytes:diagnosticMetric, ms:diagnosticMetric |
| `mssql.queryResults.spatial.decode.cancel` | webviewMark | instant | — | queryResults | webview | epochAligned | no | reason:safeEnum |
| `mssql.queryResults.spatial.render.begin` | webviewMark | begin | `mssql.queryResults.spatial.render.firstPaint` | queryResults | webview | epochAligned | yes | tier:safeEnum, offline:safeEnum |
| `mssql.queryResults.spatial.render.firstPaint` | webviewMark | end | `mssql.queryResults.spatial.render.begin` | queryResults | webview | epochAligned | yes | tier:safeEnum, features:diagnosticMetric, vertices:diagnosticMetric, partial:safeEnum, rafThrottled:structuralMetadata |
| `mssql.queryResults.spatial.render.settled` | webviewMark | instant | — | queryResults | webview | epochAligned | no | tier:safeEnum, features:diagnosticMetric, vertices:diagnosticMetric, skipped:diagnosticMetric, partial:safeEnum, longTasks:diagnosticMetric, derivedBytes:diagnosticMetric, ms:diagnosticMetric |
| `mssql.queryResults.spatial.render.cancel` | webviewMark | instant | — | queryResults | webview | epochAligned | no | reason:safeEnum |
| `mssql.queryResults.spatial.interaction.end` | webviewMark | instant | — | queryResults | webview | epochAligned | no | action:safeEnum, tier:safeEnum, frames:diagnosticMetric, p95FrameMs:diagnosticMetric, inputDelayMs:diagnosticMetric |
| `mssql.queryResults.spatial.resources.released` | marker | instant | — | queryResults | extensionHost | sameProcessMonotonic | no | reason:safeEnum, leases:diagnosticMetric, sessions:diagnosticMetric |

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
| `mssql.queryStudio.query.toFirstPage` | queryStudio | `mssql.queryStudio.query.submit` → `mssql.queryStudio.query.firstPage` |
| `mssql.queryStudio.query.toRender` | queryStudio | `mssql.queryStudio.query.submit` → `mssql.queryStudio.resultsRendered` |
| `sqlDataPlane.tsNative.query.duration` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.firstMetadata` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.firstPageProduced` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.firstPageAccepted` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.encode` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.sinkWait` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.pause.backpressure` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.pause.cpuYield` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.maxSynchronousSlice` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.logicalEncodedBytes` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.pages` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.driverEvents` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `sqlDataPlane.tsNative.query.yields` | sqlDataPlane | `sqlDataPlane.tsNative.query.terminal` |
| `mssql.queryResults.snapshot.create` | queryResults | `mssql.queryResults.snapshot.create.begin` → `mssql.queryResults.snapshot.create.end` |
| `mssql.queryResults.pin.open` | queryResults | `mssql.queryResults.pin.open.begin` → `mssql.queryResults.pin.open.end` |
| `mssql.queryResults.transform.evaluate` | queryResults | `mssql.queryResults.transform.evaluate.begin` → `mssql.queryResults.transform.evaluate.end` |
| `mssql.queryResults.pin.toRender` | queryResults | `mssql.queryResults.pin.open.begin` → `mssql.queryResults.pin.rendered` |
| `mssql.queryStudio.open.toEditorInteractive` | queryStudio | `mssql.queryStudio.open.begin` → `mssql.queryStudio.boot.editorInteractive` |
| `mssql.queryStudio.open.toResultsRendered` | queryStudio | `mssql.queryStudio.open.begin` → `mssql.queryStudio.resultsRendered` |
| `mssql.queryStudio.boot.vectorChunkLoad` | queryStudio | `mssql.queryStudio.boot.vectorChunkRequested` → `mssql.queryStudio.boot.vectorChunkLoaded` |
| `mssql.queryStudio.boot.spatialChunkLoad` | queryStudio | `mssql.queryStudio.boot.spatialChunkRequested` → `mssql.queryStudio.boot.spatialChunkLoaded` |
| `mssql.queryResults.vector.analysis` | queryResults | `mssql.queryResults.vector.analysis.begin` → `mssql.queryResults.vector.analysis.end` |
| `mssql.queryResults.spatial.prepare` | queryResults | `mssql.queryResults.spatial.prepare.begin` → `mssql.queryResults.spatial.prepare.end` |
| `mssql.queryResults.spatial.decode` | queryResults | `mssql.queryResults.spatial.decode.begin` → `mssql.queryResults.spatial.decode.end` |
| `mssql.queryResults.spatial.render.firstPaint` | queryResults | `mssql.queryResults.spatial.render.begin` → `mssql.queryResults.spatial.render.firstPaint` |

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
