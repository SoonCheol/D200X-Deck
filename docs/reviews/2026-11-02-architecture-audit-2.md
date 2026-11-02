# Ulanzi Deck Open — second architecture and security audit

Date: 2026-11-02. Production source reviewed: `4acfaabe3bf2d02258a6ded130ef820ea2459781`, version **0.8.4**, initially clean `main`. Desktop application scope: `app/`, its tests and build/CI configuration. The Python protocol prototype is outside this review.

**Tests-only branch requested during the audit:** `test/audit-0.8.4-regressions`, local commit **`52ca85b`**. It adds `app/test/audit-regressions.test.js`; production files are unchanged. Its nine new regression cases deliberately expose existing defects: **75 original tests pass; 9 new regression tests fail; 84 total**. Lint and typecheck pass. This branch is a red regression specification, not a fix or a release candidate. See Appendix A for its contents and verification. It has not been pushed.

Evidence labels: **executed** means a bounded local check against inert temporary fixtures; **source** means the complete relevant code path was read and its control flow verified. Source confidence is separate from live-browser, hardware or deployed-service validation. No remote exploit, hardware behavior or current vulnerability-database status is asserted without evidence.

## 1. Executive summary

- **Fix imported command consent first (H1).** Bare legacy steps evade the import scanner, then normalize into runnable shell commands after restart. This was reproduced without executing a command. The 0.6.1 protection was incomplete; it was not subsequently reverted. `app/renderer/app.js:503`, `app/lib/store.js:54`.
- **Malformed plugin metadata can prevent the entire editor from opening (H2).** Both hosts scan before registering their EventEmitter error listener. A bad manifest throws through startup before `createWindow()`. `app/plugin-hosts.js:84`, `app/lib/plugin-host.js:181`, `app/main.js:610`.
- **Installation can delete its own selected source (M1).** Selecting an already-managed plugin folder makes source and destination identical; removal precedes copying. Failed update copies also lose the prior working package. Reproduced with an inert plugin. `app/lib/plugin-host.js:466`.
- **The shared lifecycle still has process-ownership defects (M2–M6).** Reload forgets children before exit; old exits can remove replacement sockets; connect-then-crash resets the crash counter. Pending startup can outlive shutdown. Consolidation exposed these shared invariants clearly; keep the shared host. `app/lib/plugin-host.js:299`, `app/lib/plugin-host.js:329`, `app/lib/plugin-host.js:355`.
- **Two actual refactor regressions have git provenance.** `c42f86e` allows later launch attempts after a failed port bind (M4); `8c573ef` omits the missing-payload PI retry code (L1). `app/lib/plugin-host.js:258`, `app/lib/pi-theme.js:30`.
- **Config recovery is only partially correct (M8–M9, L2).** Backup images remain `file:` refs. A null page reaches image traversal before tolerant validation; recovery itself can throw during backup image GC after replacing the primary with defaults. Both were reproduced. `app/lib/store.js:403`, `app/lib/store.js:316`, `app/lib/store.js:455`.
- **The WebSocket origin policy is incomplete (M7).** Literal `Origin: null` is admitted, and a known installed plugin UUID receives settings without a registration secret. The guard and disclosure were exercised with dummy settings and a fake transport; internet-browser access was not tested. `app/lib/plugin-host.js:199`, `app/lib/plugins.js:192`.
- **The main Electron boundaries improved materially.** All 62 request handlers use one resolved-path sender guard; the fixed preload, main/POP sandbox, script-payload escaping and PI source/origin checks remain present. These earlier findings are not re-reported as unfixed. `app/ipc.js:25`, `app/ipc.js:35`, `app/main.js:103`, `app/lib/pi-theme.js:29`.
- **Action semantics need tests more than another broad refactor (M12–M15).** Nested plugin actions are not synced, asynchronous multi steps are not awaited, sequence cancellation is global, and several page/profile transitions leave press timers alive. `app/renderer/ui.js:468`, `app/renderer/press.js:198`, `app/renderer/app.js:330`.
- **Release checks lag PR checks (M23).** Branch CI runs tests/lint/typecheck; the independently triggered release job runs tests only. Dependency installation uses `npm ci`, native helpers are source-built, and bundle exclusion rules are improved. Current advisories and Electron support status remain unverified offline. `.github/workflows/release.yml:30`, `.github/workflows/ci.yml:27`, `app/package-lock.json:1060`.

**Verdict:** the 0.7/0.8 seams are worth keeping, but close the import-consent, installation, recovery and process-lifecycle defects before treating 0.9 as a UI-only release.

## 2. Scorecard

| Area | Rating | Evidence-based assessment |
|---|---|---|
| Architecture | **B−** | Main is down to 669 lines and lifecycle/protocol/metadata reuse is real; IPC remains 969 lines and renderer transitions/action traversal have conflicting contracts. |
| Security | **C+** | IPC and sandbox hardening survived, but imported shell consent can be bypassed and WS admission, credential redirects and secret logging retain specific gaps. |
| Reliability | **C** | Atomic config writes and tracked-child shutdown escalation are good; installation, recovery and restart ownership still have reproducible failures. |
| Test coverage | **C−** | The original 75 pass, but exercise mostly libraries; the nine added failing cases show exactly what the integration seams missed. This is an assessment of scope, not measured line coverage. |
| CI/build | **B−** | Locked installs, native source builds and PR gates are present; release checks diverge and tool/action inputs remain mutable. No DMG was built or inspected. |
| Dependency hygiene | **B, provisional** | Three direct runtime packages and Dependabot are appropriate; fresh advisory results and Electron support/EOL could not be established offline. |
| Duplication | **B** | Host/protocol/version/metadata duplication fell substantially; action traversal, context transitions and a few identical helpers still drift. |

## 3. Findings by severity

38 findings: 2 High, 25 Medium, 10 Low, 1 Nit. **No Critical finding confirmed.** Effort: S = local change, M = several connected paths/tests, L = substantial redesign. Severity includes operational impact; H2 is availability, not a remote code-execution claim.

### Critical

None confirmed.

### High

#### H1. Imported shorthand command steps bypass confirmation

**Where:** `app/renderer/app.js:503`, `app/renderer/app.js:420`, `app/ipc.js:108`, `app/lib/store.js:50`, `app/renderer/press.js:222`, `app/lib/actions.js:248`.

**What:** `eachImportedAction()` visits only `step.action`, but normalization also accepts a bare step such as `{type:'command',value:'INERT_AUDIT_SENTINEL'}`. The importer preserves that representation and save does not normalize it. On the next load, `normalizeAction()` wraps it into `step.action`. The shell-command confirmation and `imported` marking never saw it. This applies to multi/toggle/POP steps. **Executed:** the scanner reported zero commands before save, then one unmarked command after load; no command was executed.

**Why:** a user imports a shared document, restarts the app, and a later key/menu choice can execute a command with their permissions without the promised consent. Canonical command imports still prompt; this is an accepted-representation bypass, not removal of the entire feature.

**Fix:** normalize/reject imported action shapes before counting commands, remapping and persisting. Use the same canonical traversal for pages, pins, hold/double and nested steps. Show a command warning for a container containing imported commands too; the canvas badge currently checks only a top-level command (`app/renderer/render.js:346`). **Effort M · Confidence high.** Protection introduced incompletely in `361c04b`; not a later regression. Added branch tests cover all three container types.

#### H2. Bad plugin manifests abort startup before any window is created

**Where:** `app/plugin-hosts.js:84`, `app/plugin-hosts.js:92`, `app/plugin-hosts.js:149`, `app/plugin-hosts.js:157`, `app/lib/plugin-host.js:180`, `app/main.js:558`.

**What:** both hosts call `scan()` before adding their `error` listener. Parsing an invalid manifest throws; the scanner catches it and emits EventEmitter's special `error` event, which throws when there is no listener. Startup rejects before `main.js:610` creates the window. **Executed:** scanning an invalid-JSON fixture without a listener threw `Failed to read …`.

**Why:** a damaged or hand-edited app/vendor plugin can disable the entire editor, including the UI needed to remove it. The process-level logger does not resume the rejected startup chain; process termination itself is not claimed.

**Fix:** attach error listeners before scan/start for each manager; test `initPluginHosts()` with one bad manifest and a mocked server/window dependency. **Effort S · Confidence high.** Predates the split/merge.

### Medium

#### M1. Plugin installation destroys the source or old working copy before copying succeeds

**Where:** `app/lib/plugin-host.js:459`, `app/lib/plugin-host.js:466`, `app/lib/plugin-host.js:467`, `app/lib/plugins.js:120`.

**What:** destination removal precedes `cpSync`. Selecting an already-installed `.ulanziPlugin` directory can make `root === dest`; removal deletes the selected source and the copy throws. **Executed:** an inert managed plugin's source disappeared after the attempted install. An unrelated copy failure during update similarly leaves no previous package.

**Why:** a normal folder-picker choice or disk/copy error loses the working installation. The error response cannot roll it back.

**Fix:** reject real source/destination identity or overlap before mutation; copy and validate into a sibling staging directory, stop the old process, then swap while retaining rollback until success. Apply the same replacement discipline to `import()` at `app/lib/plugin-host.js:481`. **Effort M · Confidence high.** Branch test checks source preservation whether the operation rejects or no-ops.

#### M2. Reload/restart forget live children before confirming termination

**Where:** `app/lib/plugin-host.js:341`, `app/lib/plugin-host.js:342`, `app/lib/plugin-host.js:357`, `app/lib/plugin-host.js:383`, `app/lib/plugin-host.js:547`.

**What:** restart/reload/reloadOne send SIGTERM and immediately delete/clear child ownership. Restart launches again after a fixed 200 ms. Shutdown escalates only processes still present in its captured children list.

**Why:** a SIGTERM-resistant old plugin can overlap its replacement and survive later app shutdown. The existing shutdown test proves escalation for tracked children only.

**Fix:** share a stop-one routine that retains ownership, waits for exit and escalates before replacement/removal; shutdown must include children already stopping. **Effort M · Confidence high, source.** Predates consolidation. The new branch checks replacement ordering with a fake still-live child.

#### M3. Old and replacement process generations corrupt each other's lifecycle state

**Where:** `app/lib/plugin-host.js:301`, `app/lib/plugin-host.js:302`, `app/lib/plugin-host.js:303`, `app/lib/plugin-host.js:340`.

**What:** restart suppression is keyed only by plugin UUID. If a replacement exits before the old process, it consumes the old process's marker and skips its own cleanup/backoff. Reload all does not mark the old child; its later exit can leave the newer child intact by identity check but still delete the newer socket unconditionally.

**Why:** apparently successful reloads can lose their new connection or stop retrying after a replacement crash. This differs from M2's leaked-process problem: it is incorrect ownership of exit side effects.

**Fix:** associate suppression/socket cleanup with the exact child generation and ignore stale exits before mutating any current-generation state. **Effort M · Confidence high, source.** Predates `c42f86e`.

#### M4. Regression: a failed port bind becomes “ready” for later launches

**Where:** `app/lib/plugin-host.js:222`, `app/lib/plugin-host.js:256`, `app/lib/plugin-host.js:258`, `app/lib/plugin-host.js:279`, `app/lib/streamdeck-plugins.js:925`.

**What:** failure resolves `_portPromise` with null. The waiting callback nevertheless sets `_portReady=true`; a later key/restart request skips the pending-port guard and spawns using the stale configured port despite no listening server. **Executed:** a failed-port promise produced no first spawn but a second ensure produced one.

**Why:** after all fallback ports fail, plugins can be launched against an unavailable or other application's endpoint.

**Fix:** distinguish settled failure from listening success and require a live bound server before spawning; allow explicit bounded server retry rather than bypassing readiness. **Effort S · Confidence high. Regression introduced by `c42f86e`.** The preceding hosts launched only for a truthy resolved port. Branch test exposes it.

#### M5. Pending plugin startup can outlive shutdown

**Where:** `app/lib/plugin-host.js:205`, `app/lib/plugin-host.js:257`, `app/lib/plugin-host.js:251`, `app/lib/plugin-host.js:547`, `app/lib/plugin-host.js:551`.

**What:** pending port callbacks have no stopping/generation check. Shutdown snapshots children before the promise resolves and cannot close a server not yet assigned to `this.wss`. The later callback can call `_ensurePlugin()` and spawn after shutdown. **Executed:** resolving a fake pending port after awaited shutdown still called the spawn hook.

**Why:** a child started after the shutdown snapshot receives neither TERM nor KILL from that shutdown.

**Fix:** refuse `_ensurePlugin()` while stopping, invalidate pending launch generations, and retain/close the pending WebSocketServer as well as the listening one. **Effort S/M · Confidence high.** Predates consolidation. Branch test covers delayed port resolution.

#### M6. A plugin that connects before crashing defeats the crash limit

**Where:** `app/lib/plugins.js:198`, `app/lib/streamdeck-plugins.js:470`, `app/lib/plugin-host.js:305`, `app/lib/plugin-host.js:310`, `app/lib/streamdeck-plugins.js:925`.

**What:** every successful registration deletes crash history. Repeated connect→crash cycles therefore restart at count one instead of reaching the five-crash stop. SD key handling also calls ensure independently of the scheduled delay/give-up state.

**Why:** the documented crash cap is not enforced for a common failure pattern; repeated key presses can also restart work during intended backoff.

**Fix:** reset only after a measured stable uptime; enforce retry-after/disabled state in the single ensure decision, including manual-key paths. Keep explicit user restart able to reset the policy. **Effort M · Confidence high, source.**

#### M7. Opaque-Origin clients can claim a plugin UUID and receive settings

**Where:** `app/lib/plugin-host.js:194`, `app/lib/plugin-host.js:199`, `app/lib/plugins.js:192`, `app/lib/plugins.js:200`, `app/lib/streamdeck-plugins.js:453`, `app/lib/streamdeck-plugins.js:477`.

**What:** the origin guard rejects only HTTP(S) strings and admits literal `null`. Registration authenticates a public installed UUID, not a launched instance. Registration sends global settings and replays action settings. **Executed:** the actual extracted guard admitted `null`; a fake transport registered an installed fixture UUID and received its dummy token.

**Why:** the intended web-client exclusion is weaker than its comment states. Any opaque-Origin client that can reach the loopback socket can impersonate that plugin and receive its settings. **No internet-browser reachability or remote exfiltration was demonstrated**; browser loopback/private-network policy is a separate untested prerequisite. Native local programs already have user authority, so this is not claimed as local privilege escalation.

**Fix:** explicitly allow absent Origin for SDK processes and the exact intended PI origins; reject opaque/unexpected origins. Where SDK compatibility permits, bind registration to a per-launch capability instead of UUID knowledge. **Effort S/M · Confidence high for admission/disclosure; medium for browser exposure.**

#### M8. Backup recovery returns unusable file-backed image references

**Where:** `app/lib/store.js:390`, `app/lib/store.js:403`, `app/lib/store.js:368`, `app/renderer/render.js:24`.

**What:** primary load internalizes disk `file:<hash>` refs into data URLs; backup load skips that step. **Executed:** after corrupting an image-bearing primary, recovery reported `backup` but returned a literal `file:<hash>.png` icon.

**Why:** restored keys/backgrounds do not receive the renderer's expected image representation until a later normal load. Existing image-free backup tests miss it.

**Fix:** pass backup JSON through the same internalization path as the primary; exercise icons, backgrounds and pins in recovery tests. **Effort S · Confidence high.** Branch test covers key icon and page background.

#### M9. The malformed-page fix is bypassed before validation, and recovery can itself throw

**Where:** `app/lib/store.js:316`, `app/lib/store.js:423`, `app/lib/store.js:166`, `app/lib/store.js:410`, `app/lib/store.js:455`, `app/test/store.test.js:287`.

**What:** image traversal and migration dereference null pages before the validator's new skip. On recovery, save copies the malformed primary to `.bak`, then image pruning traverses that malformed backup. **Executed, no prior backup:** `[null, validPage]` made load throw `Cannot read properties of null (reading 'background')` through save→prune after writing defaults to the primary. The existing passing test calls only `validateConfig()`.

**Why:** one malformed entry can replace valid pages and prevent startup from completing. Recovery reporting cannot help if load never returns.

**Fix:** sanitize structural collections before image traversal/migration, make backup image-reference collection tolerate malformed data, and exercise the real on-disk load path. **Effort S/M · Confidence high.** Incomplete `361c04b` fix, not a later regression. Branch test exposes the failure.

#### M10. Key capture reports success before capture, and cannot recognize its native permission errors

**Where:** `app/main.js:448`, `app/main.js:479`, `app/native/hidseize.c:49`, `app/native/hidseize.c:62`, `app/native/hidseize.c:83`, `app/renderer/app.js:800`.

**What:** main sets “Capturing keys” before the helper reports success. It recognizes permission denial only by `notpermitted`, while the helper emits numeric `access`, `manager`, and `seize` records. A denied helper can stay alive retrying without ever changing the optimistic state.

**Why:** the new persistent settings row can say the firmware keyboard fallback is blocked while capture has not succeeded.

**Fix:** emit/parse a small explicit status record; use starting/not-captured until a confirmed `seized` record. Parse records across chunk boundaries. **Effort S · Confidence high, source.** The watchdog exists; its success/permission reporting is incomplete.

#### M11. Ulanzi global settings are never saved

**Where:** `app/lib/plugins.js:454`, `app/lib/plugin-host.js:151`, `app/lib/streamdeck-plugins.js:750`, `app/plugin-hosts.js:86`.

**What:** Ulanzi `setGlobalSettings` updates memory and emits an event, but neither it nor wiring calls the shared persistence method. SD does. **Executed:** accepting dummy global settings called a persistence spy zero times.

**Why:** a plugin can appear configured and lose its globals on app restart.

**Fix:** persist accepted Ulanzi globals through the existing method and test reconstructing the manager from the same scratch directory. **Effort S · Confidence high.** Predates consolidation.

#### M12. Nested and alternate-trigger plugin actions are absent from plugin synchronization

**Where:** `app/renderer/ui.js:471`, `app/renderer/ui.js:490`, `app/lib/import-ulanzi.js:192`, `app/lib/import-ulanzi.js:212`, `app/renderer/press.js:150`, `app/renderer/press.js:179`.

**What:** sync collects only a key's top-level plugin action. Imported POP children can contain plugin actions, but have no registered action instance when chosen; hold/double plugin actions have the same collection gap.

**Why:** preserved imported actions cannot run and produce “not ready” even when their plugin is installed.

**Fix:** enumerate supported nested/trigger plugin actions with stable IDs and explicit slot/visibility semantics, and use that enumeration for lookup/settings persistence too. Test an imported POP plugin child end-to-end through sync/run. **Effort M · Confidence high, source.**

#### M13. Multi Action does not wait for asynchronous steps or stop on failure

**Where:** `app/renderer/press.js:190`, `app/renderer/press.js:214`, `app/renderer/press.js:222`, `docs/ACTION-MODEL-V2.md:83`.

**What:** the sequence calls `runKeyAction()` without awaiting it; that function also drops its normal action promise. Text/hotkey subprocesses therefore start independently. Errors toast but cannot stop subsequent steps.

**Why:** a following hotkey can execute before typing finishes, and a failed preparation step does not prevent later actions. This violates the documented serial/failure-stop contract.

**Fix:** return action results, await each sequence step, and stop on failed results. Explicitly define launch-only shell actions, whose existing promise resolves on spawn rather than exit (`app/lib/actions.js:72`). **Effort M · Confidence high, source.**

#### M14. Sequence cancellation is global and ignores page departure

**Where:** `app/renderer/press.js:24`, `app/renderer/press.js:201`, `app/renderer/press.js:215`, `app/renderer/ui.js:649`, `docs/ACTION-MODEL-V2.md:85`.

**What:** one global token means a sequence on key B cancels key A; leaving a page does not change the token, so a delayed sequence resumes afterward.

**Why:** independent keys interfere, while commands delayed for a departed page can still act on the newly frontmost context.

**Fix:** track sequence ownership per key/action and cancel relevant runs through a shared page/profile transition function. **Effort M · Confidence high, source.**

#### M15. Several page/profile transitions retain pending hold/double timers

**Where:** `app/renderer/ui.js:560`, `app/renderer/app.js:330`, `app/renderer/ui.js:639`, `app/renderer/ui.js:651`, `app/renderer/press.js:341`, `app/renderer/press.js:363`.

**What:** action-driven navigate clears press timers; sidebar selection and profile switching do not. Timer closures retain the previous key/action.

**Why:** switching the UI or an app-linked profile during a pending hold/double window can execute the departed page's action.

**Fix:** run the same transition cleanup for sidebar, action, automatic profile and delete/import transitions. Cover timer advancement with fake timers. **Effort S/M · Confidence high, source.**

#### M16. Redirect handling can forward login credentials and permits cleartext token transport

**Where:** `app/lib/market.js:68`, `app/lib/market.js:72`, `app/lib/market.js:78`, `app/lib/market.js:175`, `app/lib/market.js:248`.

**What:** off-vendor redirects strip `authToken`, but 307/308 retain the login POST body containing username/password. HTTP is accepted; an HTTPS→HTTP vendor-host redirect retains the token. Package URLs can also use HTTP.

**Why:** **if such a redirect is returned**, credentials can reach another origin or a token can cross an unencrypted hop. No vendor redirect, interception or credential leak was observed live.

**Fix:** require HTTPS on every hop; reject cross-origin redirects for credential-bearing POSTs, and never retain credentials across transport/origin changes. Test a fake 307 to an unrelated origin and a downgrade. **Effort S · Confidence high for code-path behavior, source.**

#### M17. Several body-size caps apply after the full response is allocated

**Where:** `app/lib/siteicon.js:107`, `app/lib/siteicon.js:132`, `app/lib/sdcatalog.js:119`, `app/lib/market.js:19`.

**What:** site images and plugin downloads call `arrayBuffer()` before checking actual bytes; HTML calls `text()` before slicing. Missing/understated Content-Length bypasses the intended memory bound.

**Why:** an icon URL or package response can consume far more memory than its stated 2 MB/128 MB cap before rejection, potentially killing the main process.

**Fix:** stream/count/cancel before accumulating beyond the limit, reusing the existing capped-reader approach in Market; enforce a separate HTML cap. **Effort M · Confidence high, source.**

#### M18. Synchronous extraction blocks main, and expanded-size checks happen after disk expansion

**Where:** `app/lib/import-ulanzi.js:338`, `app/lib/import-ulanzi.js:350`, `app/lib/plugin-host.js:424`, `app/lib/streamdeck-plugins.js:299`, `app/ipc.js:278`.

**What:** archive extraction uses main-thread `execFileSync` without a timeout. Profile expanded-size validation runs only after extraction; plugin/icon extraction has no equivalent expanded-output budget.

**Why:** a small highly compressed archive can freeze the application and consume substantial disk before validation responds. No archive bomb or zip-slip exploit was executed.

**Fix:** enforce entry-count and expanded-byte limits during bounded extraction, off the main thread; use existing JSZip/worker facilities rather than adding an installer framework. Keep post-extraction validation as a second check. **Effort M/L · Confidence high, source.**

#### M19. Marketplace requests and body reads have no bounded deadline

**Where:** `app/lib/market.js:73`, `app/lib/market.js:161`, `app/lib/market.js:231`, `app/lib/market.js:253`.

**What:** login/list/resource/HEAD/download paths supply no abort signal. Their full body/read loop has no application deadline either.

**Why:** a stalled response can leave a login or install control pending with no bounded recovery time.

**Fix:** apply an operation-wide AbortSignal through redirects and body consumption, following the catalogue/updater's existing pattern. **Effort S · Confidence high, source.**

#### M20. Re-enabling automatic updates can leave the scheduler stopped

**Where:** `app/renderer/app.js:1293`, `app/renderer/ui.js:423`, `app/ipc.js:172`, `app/main.js:279`.

**What:** the renderer debounces config save for 250 ms but immediately requests rescheduling. Main still sees stored `updateCheck:false`, clears/omits the timer, then the later save does not reschedule it.

**Why:** a setting can visibly be enabled while automatic checks remain off until another scheduling trigger or restart.

**Fix:** persist before rescheduling, or detect the relevant setting change in the main save handler and reschedule atomically there. **Effort S · Confidence high, source.**

#### M21. Diagnostics redact only top-level settings names

**Where:** `app/lib/streamdeck-plugins.js:80`, `app/lib/streamdeck-plugins.js:450`, `app/lib/streamdeck-plugins.js:789`, `app/plugin-hosts.js:104`, `app/lib/plugin-host.js:532`.

**What:** `{auth:{token:'DUMMY'}}` retains its nested token in `logSettings()`. That serializer feeds always-enabled SD diagnostics; URL logging at `app/lib/streamdeck-plugins.js:775` can also retain credential-bearing query strings.

**Why:** a log shared for support can disclose credentials even though the redaction comment promises to keep settings secrets out. Rotation bounds size, not sensitivity.

**Fix:** omit settings contents and sensitive URL components from normal logs; if payload diagnostics are necessary, recursively redact with a bounded serializer and explicit opt-in. **Effort S/M · Confidence high, source.**

#### M22. Installing Rosetta then clicking Reload all retains the “Needs Rosetta” state

**Where:** `app/lib/streamdeck-plugins.js:357`, `app/lib/streamdeck-plugins.js:370`, `app/lib/plugin-host.js:371`, `app/renderer/pickers.js:432`.

**What:** negative Rosetta/Wine availability results are cached for the process lifetime; reload rescans without resetting them. The UI explicitly directs users to install Rosetta and Reload all.

**Why:** following the instruction does not make the plugin compatible until the whole app restarts.

**Fix:** invalidate negative runtime-availability caches on explicit reload, or retry negative checks with a modest TTL. **Effort S · Confidence high, source.**

#### M23. Publishing a tag does not require the lint/type gates

**Where:** `.github/workflows/release.yml:3`, `.github/workflows/release.yml:30`, `.github/workflows/ci.yml:4`, `.github/workflows/ci.yml:27`.

**What:** release runs on tags/manual dispatch and checks tests only; branch CI runs on main/PR and separately checks lint/typecheck. There is no release-job dependency on a successful CI result for that exact commit.

**Why:** a tag can publish an app containing errors that the newer branch gates would reject, including the class of undefined-name mistakes fixed in 0.8.1.

**Fix:** run the same checks in the release job or reuse one required validation workflow/job. **Effort S · Confidence high, source.** This is a partial gate rollout, not a removal of PR checks.

#### M24. Tests check extracted helpers but miss critical end-to-end invariants

**Where:** `app/test/channels.test.js:34`, `app/test/store.test.js:287`, `app/test/plugin-host.test.js:28`, `app/ipc.js:46`, `app/plugin-hosts.js:16`.

**What:** channel tests match registration text without calling handlers. Malformed-page tests call the validator without load/internalize/GC. The two host tests cover a tracked fake child's shutdown and action cleanup, not failed binding or replacement ownership. Main/IPC/host wiring/preload/renderer have no baseline behavioral integration tests.

**Why:** the original 75 all pass while H1, M1, M4, M5, M8 and M9 reproduce. The added nine tests fail on the current implementation, making these gaps concrete rather than a coverage-percentage concern.

**Fix:** land the requested test branch with the corresponding fixes. Highest value: imported shorthand command→save/load→same consent requirement. Next: fake-Electron `registerIpc` harness exercising sender paths/frames, lazy getWin dialogs and SD store install. That harness would have caught the missing downloader import/undefined win fixed by `9f3c1b8` before the no-undef guard existed. **Effort M · Confidence high.** Test-only branch does not yet cover all IPC/renderer paths.

#### M25. Plugin-local views treat query parameters as part of the filename

**Where:** `app/plugin-hosts.js:41`, `app/plugin-hosts.js:44`, `app/plugin-hosts.js:47`, `app/plugin-hosts.js:55`.

**What:** `openview` appends `msg.param` as `?…` before resolving a local path, then passes that whole string to `loadFile()`. `index.html` plus `{id:'1'}` becomes the filename `index.html?id=1`.

**Why:** a valid local plugin view with parameters fails to load even though its HTML file exists.

**Fix:** parse pathname and query separately, contain the pathname, and use `loadFile(file, {query})`. **Effort S · Confidence high, source.** Predates the split.

### Low

#### L1. Regression: missing inspector payloads no longer trigger the existing retry

**Where:** `app/lib/pi-theme.js:30`, `app/lib/pi-theme.js:33`, `app/main.js:517`, `app/renderer/inspector.js:1195`.

**What:** the entire connection block is emitted only for a truthy `connect`; its internal null-payload retry is therefore unreachable. **Executed:** `buildPiBridge({connect:null,openLinks:true})` contained no connection function.

**Why:** an inspector loaded while its action is temporarily absent during reload/resync remains disconnected. Normal first-open sync-before-URL reduces the common-case exposure.

**Fix:** emit SD connection/recovery independently of whether the payload exists, while continuing to omit it for Ulanzi inspectors. **Effort S · Confidence high. Regression introduced by `8c573ef`; parent revision always emitted the retry.** Script escaping itself remains fixed.

#### L2. Recovery notices misclassify structurally empty configs and first use

**Where:** `app/lib/store.js:417`, `app/lib/store.js:389`, `app/lib/store.js:408`, `app/renderer/app.js:1690`.

**What:** empty/missing pages return defaults as a successful migration without a recovery flag; a genuinely absent first-run config falls through the same catch as a damaged file and sets `defaults`. **Executed:** a version-6 `pages:[]` file returned defaults with no notice.

**Why:** a destructive fallback can be silent, while a fresh install can announce damaged-config recovery.

**Fix:** distinguish expected ENOENT first use from invalid existing input and consistently classify repaired/reset content. **Effort S · Confidence high.**

#### L3. Own-format profile export/import is not a complete round trip

**Where:** `app/renderer/app.js:390`, `app/renderer/app.js:463`, `app/renderer/app.js:475`.

**What:** export clones full pages and exports the profile icon; import whitelists fewer fields, dropping page `wideMode`, `autoExitSeconds` and the profile icon.

**Why:** restoring a backup changes stats/blank panels to clock and removes folder auto-exit behavior.

**Fix:** preserve these existing validated fields explicitly and test export→import equivalence modulo remapped IDs. **Effort S · Confidence high, source.**

#### L4. Unsupported imported actions lose their preserved source data after reload

**Where:** `app/lib/import-ulanzi.js:440`, `app/lib/import-ulanzi.js:448`, `app/lib/store.js:64`.

**What:** import stores `sourceAction` on an unmapped placeholder; `normalizeKey()` never copies it, so the next load discards the raw action/parameters/plugin record.

**Why:** the promised ability to retain unknown action data for future mapping is not durable.

**Fix:** preserve a validated bounded `sourceAction` field and test a save/load of an unmapped key. **Effort S · Confidence high, source.**

#### L5. Zero sound volume becomes full volume

**Where:** `app/lib/store.js:29`, `app/lib/actions.js:202`, `app/lib/import-ulanzi.js:206`.

**What:** `Number(volume) || 1` treats valid zero as missing; import repeats the same truthiness fallback.

**Why:** a muted sound action can unexpectedly play at full configured gain.

**Fix:** default only absent/non-finite values and preserve zero consistently in validation, import and execution. **Effort S · Confidence high, source.**

#### L6. Catalogue release metadata never expires

**Where:** `app/lib/sdcatalog.js:39`, `app/lib/sdcatalog.js:64`, `app/lib/sdcatalog.js:74`.

**What:** catalogue items expire after ten minutes, but resolved per-plugin releases stay cached indefinitely; list refresh does not clear them.

**Why:** a long-running app can keep offering an old version/download even after catalogue refresh.

**Fix:** timestamp release entries or invalidate them when refreshing the catalogue; test two sequential release versions. **Effort S · Confidence high, source.**

#### L7. Native menu “Check for Updates…” discards its result

**Where:** `app/main.js:309`, `app/main.js:242`, `app/renderer/app.js:1282`.

**What:** the native menu calls the checker and ignores the returned result. Unlike the renderer button, it does not render/toast errors, up-to-date state or available-version UI.

**Why:** a user-requested check appears to do nothing; scheduled checks have a separate notification path and do not repair the manual menu path.

**Fix:** route manual results through one renderer event/handler and surface the window when necessary. **Effort S · Confidence high, source.**

#### L8. Full-image config IPC and synchronous saves retain the previous L5 cost

**Where:** `app/ipc.js:99`, `app/ipc.js:108`, `app/lib/store.js:377`, `app/lib/store.js:477`, `app/lib/store.js:479`, `app/renderer/ui.js:426`.

**What:** load expands all images; app:state and every debounced save transmit the complete in-memory config. Save clones/base64-decodes/hashes images, stringifies, copies backup and scans image files synchronously even for a small label/title change.

**Why:** work scales with the whole profile library rather than the edit. No startup latency, memory or frame-time benchmark was measured; this is confirmed work/serialization, not an invented millisecond estimate.

**Fix:** first avoid saves for transient push timestamps (`app/renderer/ui.js:544`) and measure a representative large scratch profile; then expose validated image references and resolve lazily. Keep this staged with renderer work rather than rewriting all state now. **Effort M · Confidence high for data flow, source.** Unresolved previous L5, not a regression.

#### L9. ULANZI_NO_DECK still starts the real keyboard-capture helper

**Where:** `app/main.js:359`, `app/main.js:384`, `app/main.js:566`, `app/native/hidseize.c:81`.

**What:** the flag suppresses Deck.connect in the reconnect loop, but helper startup remains unconditional.

**Why:** a supposedly hardware-free scratch/screenshot run can still request Input Monitoring and seize the real keyboard HID collection. This audit did not launch the app.

**Fix:** honor no-deck mode when starting/restarting hidseize too, or expose a clearly separate explicit test-mode capture decision. **Effort S · Confidence high, source.**

#### L10. Release automation still executes mutable action/toolchain inputs

**Where:** `.github/workflows/release.yml:13`, `.github/workflows/release.yml:19`, `.github/workflows/release.yml:21`, `.github/workflows/release.yml:43`, `app/scripts/build-helpers.sh:10`.

**What:** actions use `@v4`, runner uses `macos-latest`, Node uses a moving 22.x selection, and clang/SDK are the runner defaults. The lockfile does not freeze those inputs; release has contents-write permission.

**Why:** source/lockfile identity alone does not establish a repeatable build environment, and mutable action tags are supply-chain exposure. No compromise or bit-for-bit reproducibility failure was demonstrated.

**Fix:** pin action SHAs with Dependabot updates, select an explicit runner generation and record exact Node/Xcode/SDK versions alongside artifacts. Do not claim bit-reproducible DMGs until independently compared. **Effort S/M · Confidence high, source.**

### Nit

#### N1. Stream Deck overrides the queue flusher with the same implementation

**Where:** `app/lib/plugin-host.js:240`, `app/lib/streamdeck-plugins.js:794`.

**What:** the subclass method duplicates the inherited readiness check, message loop and queue deletion.

**Why:** a queue fix in the base will silently miss SD through this override.

**Fix:** delete the redundant override after the existing tests and a focused queue check. **Effort S · Confidence high, source.** No runtime failure attributed to it.

## 4. Previously fixed items — current regression check

| Previously fixed item | Still fixed? | Current evidence |
|---|---|---|
| packDir containment, icon IDs, path.relative | **Yes for lexical traversal** | `app/ipc.js:255` uses `parsePackId`/`childDir`; `app/lib/iconpacks.js:9` rejects dot/root/separator/NUL names; reads use basename/parent at `app/ipc.js:356`. `app/lib/paths.js:10` rejects root/sibling traversal. Iconpack/path tests passed. Symlink realpath containment is not implied. |
| IPC default-deny, every request handler through helper | **Yes** | 62 `handle(CH…)` registrations; sole request `ipcMain.handle` is `app/ipc.js:36`, guarded at `:37`. Resolved file path comparison at `:28`. POP's separate one-way choice listener verifies popup webContents at `app/ipc.js:928`. |
| Main and POP renderer sandbox | **Yes** | `app/main.js:103`, `app/ipc.js:914`; fixed preloads require only Electron. |
| `</script>` escaping in SD inspector payload | **Yes** | `app/lib/pi-theme.js:29`; bounded bridge check retained escaped `\\u003c` payload, with no raw closing tag in settings. L1 is a separate retry regression. |
| Imported command confirmation and imported badge | **Partial/incomplete original fix** | Canonical scan/prompt/mark remain at `app/renderer/app.js:530`, `:538`; top-level canvas badge at `app/renderer/render.js:346`. H1 reproduces shorthand bypass; nested container badge is absent. `361c04b` introduced this incompletely. |
| Deck.status shadowing on HID errors | **Yes** | Scan error is local at `app/lib/deck.js:45`; `_lastStatus`/status method separate at `:98`/`:104`. No `this.status =` assignment. Hardware failure not induced. |
| Config backup/default recovery reporting | **Partial/incomplete** | One-shot flags at `app/lib/store.js:305`, `:404`, `:409`; renderer at `app/renderer/app.js:1690`. M8/M9/L2 cover recovery paths missed by the original fix. |
| hidseize watchdog and Deck settings state | **Watchdog yes; state incomplete** | Error/exit backoff at `app/main.js:469`, `:487`; settings row at `app/renderer/app.js:800`. M10 proves native/status format mismatch. Hardware reconnection remains unvalidated below. |
| Async frontmost-app lookup | **Yes** | `app/ipc.js:787`, `:798`: async execFile, in-flight sharing and cache. Other synchronous operations still exist; this lookup no longer uses execFileSync. |
| sd-pi-open handling, PI source/origin checks | **Yes** | `app/renderer/app.js:1539` requires current iframe source and expected scheme origin; links HTTP(S)-filtered at `:1546`. |
| Shared version comparator | **Yes** | `app/lib/version.js:12`; consumed by updates/catalogue and `DeckVersion` in `app/renderer/store-ui.js:345`; loaded at `app/renderer/index.html:486`. |
| ESLint including Node no-undef, lib checkJs, CI gates | **Yes on branches; release incomplete** | `app/eslint.config.js:49`, `app/tsconfig.json:13`, `.github/workflows/ci.yml:27`; lint and typecheck pass. M23 documents the release exception. |
| Helpers source-built, not committed | **Yes in tracked source** | `git ls-files app/bin app/build/helpers` empty; `app/scripts/build-helpers.sh:10`/`:12` compiles/lipos all three sources, wired by `app/package.json:12`. No build executed. |
| Bundle excludes test/scripts/native | **Yes in recipe; artifact not inspected** | Package ignore expressions in `app/package.json:15`/`:16` exclude these paths and `build/helpers`. No claim about actual 0.8.4 DMG contents without building/downloading it. |
| Both hosts consolidated on PluginHost | **Yes; retain it** | `app/lib/plugins.js:41`, `app/lib/streamdeck-plugins.js:116`; shared implementation `app/lib/plugin-host.js:43`. M4 is a consolidation regression; other lifecycle ownership bugs predate it. |

Additional **confirmed refactor regressions:** M4 → `c42f86e148979f57b57898882439d1d072de2fba`; L1 → `8c573effa3242ab1a208edbc9600bdfed6e4d665`. Local git supplied provenance; no PR number was inferred or fetched.

## 5. Duplication map and smallest architecture seams

| Concept | Location A | Location B | Consolidation proposal |
|---|---|---|---|
| Action representation/traversal | `app/lib/store.js:21` | `app/renderer/app.js:413`, `:498`, `app/renderer/ui.js:468` | First define one canonical action tree and scanner contract; use it for consent/remapping/plugin enumeration. H1/M12 justify this, not line count. |
| Page/profile transition cleanup | `app/renderer/ui.js:560`, `:649` | `app/renderer/app.js:330` | One transition operation owns press/sequence cancellation, active IDs, save/render/push/sync. Preserve existing navigation differences explicitly. |
| Plugin stop/termination | `app/lib/plugin-host.js:329`, `:355`, `:375` | `app/lib/plugin-host.js:541` | One owned stop-one lifecycle with wait/escalation/generation, reused by restart/install/remove/shutdown. |
| Child vs HTML crash policy | `app/lib/plugin-host.js:299` | `app/lib/plugin-host.js:402` | Share the stability/retry decision while fixing M6; keep process/window termination mechanisms separate. |
| Queue flush | `app/lib/plugin-host.js:240` | `app/lib/streamdeck-plugins.js:794` | Delete subclass copy (N1). |
| File→data URL | `app/lib/plugins.js:11` | `app/lib/streamdeck-plugins.js:37` | One small shared reader only when touching these paths; preserve errors/MIME behavior. |
| MIME knowledge | `app/lib/mime.js:5`, `:32` | `app/lib/store.js:293` | Derive image MIME lookups from the registry if revisiting storage; retain explicit supported image-format allowlist. |
| Download/body limits | `app/lib/market.js:19` | `app/lib/siteicon.js:107`, `app/lib/sdcatalog.js:119` | Reuse capped stream reading with per-domain limits; do not collapse distinct authentication/redirect policies. |
| Update result UI | `app/main.js:309` | `app/renderer/app.js:1282` | Single result event/renderer handler for manual checks. |
| Helper placement | `app/package.json:15` | `app/scripts/after-package.sh:8` | Recipe does not exclude `bin` while also copying helpers to Resources/bin. Verify produced bundle before dropping the unused app/bin copy; not counted as a confirmed DMG finding. |

**IPC:** 969 lines is not itself a defect. The useful split is per stateful domain: profile import/export/apply; store/icon installation; plugin management; device/system/window functions. Each domain should receive the existing guarded `handle` registrar, not raw ipcMain. Keep resolved sender policy in one module. Extract the import transformer and installer transaction when fixing them, then register their thin handlers separately. Do not perform a bulk move before tests establish behavior.

**Return shapes and ctx:** `app:state` returns a state object; icon/plugin/app lists return arrays; inspector/image/audio/frontmost may return strings or null; POP returns an index; mutation handlers generally return result objects. The shared denial response is an object regardless of success shape (`app/ipc.js:37`). Trusted current callers generally handle their success contracts; no current scalar/array mismatch was confirmed. Test unauthorized callers for no side effects, rather than “fixing” this by breaking all preload return contracts. `getWin`, update-state and seize-state getters are necessary live references; destructured store/deck/managers remain stable objects after startup. `plugin-hosts.js` lazy getters and dialog ownership are correct in the examined paths.

**Renderer:** plain script tags are acceptable for this small desktop app, but 1,711-line app.js and 1,500-line inspector.js plus disabled renderer no-undef make changes hard to verify. The previous “73 cross-file references” count was not independently recomputed and is not reused as a current measurement. Smallest safe improvement: declare intended cross-file bindings and enable renderer no-undef, then extract pure import/action helpers and context transitions with tests. No bundler/framework or wholesale state-store rewrite is needed. The new test branch temporarily evaluates the real import-flow source because it has no exports; replace that seam with exported pure helpers when fixing H1.

**PluginHost:** the shared base's 575 lines cover genuinely common lifecycle state. Manifest parsing, executable selection, spawn arguments and protocol dispatch are appropriate subclass hooks. `spawnCommand`/`executableFor` should stay protocol-specific. Do not put SD's two-state rules, Wine/Rosetta detection, registration messages or Ulanzi context layout into the base. Tighten ownership and readiness invariants in the base before introducing composition/more classes. Generic safe extraction can become shared once SDK-specific overrides preserve their current validations.

## 6. Phased roadmap

### 0.9.x — correctness before additional structural UI work

1. **H1 + regression branch import cases:** canonicalize consent input; retain marking through save/load; include nested badges. No dependency on renderer migration.
2. **H2, M8, M9, L2:** listener order and structurally tolerant config loading/recovery/GC. Land image-bearing and malformed-input load tests with the fixes.
3. **M1:** preserve source and previous installation through staged replacement; reuse the lifecycle stop work below before swapping live packages.
4. **M2–M6:** owned termination/generation, no spawn without listening server or after shutdown, stable crash-policy enforcement. Keep both SDKs on the shared base.
5. **M7, M16, M17, M19, M21:** strict origins, credential-safe redirect/transport policy, bounded reads/deadlines, safe logs.
6. **M10, M20, M22, M23, L1, M25:** truthful capture state, update scheduling, runtime detection refresh, release gates, inspector retry, local views. Most are small connected changes.
7. Proceed with the existing 0.9 UI plan once these invariants are protected. The UI audit's already-shipped toast/sidebar/dialog changes are not reopened by this audit.

### 0.10 — action and integration seams

1. Canonical action traversal from H1 enables M12 nested plugin synchronization, lookup and settings persistence.
2. One page/profile transition operation enables M14/M15 cancellation fixes; return/await action results for M13.
3. Add the fake-Electron IPC/wiring integration harness; split per-domain registrations only as their tested logic is extracted.
4. Complete durable own-format/unmapped-data round trips (L3/L4), small sound/catalogue/menu fixes, and renderer no-undef with explicit shared contracts.
5. Bound extraction and move blocking archive work off main (M18), retaining existing SDK validations.

### 1.0 — evidence for sustained use and release confidence

1. After action/transition tests are stable, measure representative large profiles and implement lazy image refs/incremental persistence if the measured L8 cost justifies it.
2. Hardware acceptance: unplug/replug, lock/unlock/sleep, denied/granted Input Monitoring, helper crash/restart, USB/HID errors. In particular verify reacquisition after a successful initial seize.
3. Build universal DMG in an isolated release environment; inspect file list, helper architectures/placement, packaged dependency versions and unwanted files; test clean-machine launch and permissions.
4. Verify current Electron support and runtime/development advisories online, including Electron despite its devDependency classification. Pin/record build inputs; preserve unsigned/notarized status disclosure unless signing is deliberately added.
5. Keep firmware updates, additional devices, Python/OBS and a wholesale renderer rewrite out of the stabilization dependency chain.

## 7. Quick wins — approximately under 30 minutes each

Estimates include a focused check; they do not promise the larger grouped findings fit this budget.

- Register host error listeners before scan/start (H2).
- Apply `_internalize` to backup reads and run the new backup test (M8).
- Add a source/destination identity rejection before plugin deletion (immediate guard for M1; transactional update replacement remains separate).
- Require `!stopping` and actual listening success before ensure/spawn, then run the new port/shutdown cases (M4/M5).
- Save Ulanzi global settings using the existing method (M11).
- Emit the SD missing-payload retry independent of payload truthiness and test generated output (L1).
- Persist update settings before rescheduling (M20).
- Retry negative Rosetta/Wine detection on explicit reload (M22).
- Stop serializing settings contents to the default log (M21).
- Add lint/typecheck to release validation (M23).
- Pass plugin local-view query separately to loadFile (M25).
- Preserve volume zero (L5), expire release cache (L6), and remove duplicate queue flusher (N1).

## 8. What is already good

- **One sender-checked IPC registrar** with resolved paths and a fixed preload surface. Keep this default, including during domain extraction. `app/ipc.js:25`, `app/preload.js:11`.
- **Main and POP sandbox/context isolation/no Node**, restricted app navigation, explicit CSP and external-scheme filtering. `app/main.js:98`, `app/main.js:124`, `app/renderer/index.html:7`, `app/ipc.js:914`.
- **Shared protocol factory, MIME/action/geometry/version modules** are real improvements. Do not duplicate them again. `app/lib/plugin-protocol.js:16`, `app/lib/mime.js:5`, `app/lib/version.js:12`.
- **Tracked-child shutdown escalates** and the app has a bounded quit fallback. Fix tracking holes rather than removing escalation. `app/lib/plugin-host.js:541`, `app/main.js:660`.
- **Config temp-file/rename, content-addressed image files and current+backup reference retention** are appropriate. Fix malformed backup handling without abandoning this design. `app/lib/store.js:358`, `app/lib/store.js:473`.
- **Market token storage mode 0600, no password persistence, and session responses without the token** are correct. `app/lib/market.js:113`, `app/lib/market.js:125`.
- **Notify-only updater** uses a fixed HTTPS GitHub endpoint and timeout and never executes downloaded update code. `app/lib/updates.js:8`, `app/lib/updates.js:12`.
- **Node/API action execution uses argv**, with shell use isolated to the explicit command action. Trusted native/Node plugins intentionally run with user permissions and inherited environment; that is disclosed in install confirmation, not misreported here as a new sandbox escape. `app/lib/actions.js:63`, `app/ipc.js:493`, `app/lib/plugins.js:101`.
- **Plugin install identity validation and SD ZIP-entry checks** exist. No new zip-slip exploit was confirmed. `app/lib/plugins.js:132`, `app/lib/streamdeck-plugins.js:292`.
- **Dependency footprint, npm ci, source-built helpers, Dependabot and branch gates** fit a sole-maintainer project. `.github/workflows/ci.yml:23`, `.github/dependabot.yml:3`, `app/scripts/build-helpers.sh:7`.
- **Bounded image cache and log rotation** already exist; no unbounded log-size claim is made. `app/renderer/render.js:28`, `app/lib/plugin-host.js:529`. Per-message synchronous stat/append remains a measured-work candidate, not a demonstrated throughput incident.

## 9. Appendix — method, checks and limits

### A. Requested tests-only branch

Branch: **`test/audit-0.8.4-regressions`**, local commit **`52ca85b8a752cce6f9647535a523c2d911d95c6e`**, based on `4acfaabe3bf2d02258a6ded130ef820ea2459781`. Commit subject: `test: capture audit regressions in imports, recovery and plugin lifecycle`. No push was performed. Final working tree is clean; the commit changes only the new 176-line test file.

Only added tracked file: **`app/test/audit-regressions.test.js`**. No production fixes, dependency updates, installations, formatting, tags, pushes or release changes were made. The user's later branch request explicitly authorized this test-only exception to the original read-only audit; the report stays outside the repository.

| New case | Finding | Result against unchanged production code |
|---|---|---|
| Import consent invariant for shorthand multi steps | H1 | Fails: real import flow persists an executable command without consent. |
| Same invariant for toggle | H1 | Fails for the same accepted representation. |
| Same invariant for POP | H1 | Fails for the same accepted representation. |
| Load null page alongside valid pages | M9 | Fails: real recovery path throws while traversing malformed backup. |
| Restore file-backed backup icon/background | M8 | Fails: returns `file:` instead of image data URL. |
| Reinstall selected managed folder | M1 | Fails: selected source is deleted. |
| Failed bind followed by another launch attempt | M4 | Fails: spawn hook called despite no bound port. |
| Pending port settles after shutdown | M5 | Fails: spawn hook called after shutdown. |
| Restart waits for old child exit | M2 | Fails: replacement starts while old fake child remains alive. |

These tests assert desired behavior; they do not bless defects or mark failures TODO. The import fixture is an inert sentinel and never executes actions. Tests invoke the actual import/remap/consent flow with declined confirmation and stubbed UI/API, then independently inspect every persisted page after normalization. This permits a fix that rejects shorthand or normalizes before scanning. Plugin launches are spies/fake children; restart uses production exit-handler wiring and allows a bounded post-exit delay. No plugin executable, app, hardware or network server is launched. Test-created directories have cleanup hooks. The renderer-source extraction is a temporary test seam, documented in the file; replacing it with exported pure import helpers belongs with the H1 fix. Independent source review found no remaining test blockers.

### B. Commands and observed outcomes

Commands were run from the repository or `app/` as appropriate. Git inspection included `git status --short`, `git diff --stat`, `git log --oneline`, `git rev-parse HEAD`, `git show` on `361c04b`, `4e0b32b`, `8c573ef`/parent and `c42f86e`/parent, and `git ls-files app/bin app/build/helpers`. Search/inspection used rg, wc, cat, sed and nl.

| Check | Observed result |
|---|---|
| Baseline `npm test` | **75/75 pass**, no skips, exit 0, approximately 0.864 s test-runner duration. |
| Test branch `npm test` | **84 total: 75 pass, 9 fail, no skips**, exit 1; every new failure corresponds to the table above. |
| `npm run lint`, baseline and branch | Pass, exit 0, no diagnostics. |
| `npm run typecheck`, baseline and branch | Pass, exit 0. Configuration checks `lib/**/*.js`, not renderer or test types. |
| `for f in *.js lib/*.js renderer/*.js test/*.js scripts/*.js; do node --check "$f" || exit 1; done` | Baseline syntax checks pass, exit 0. New test file is also parsed/executed by the branch test run and lint. |
| `npm audit --omit=dev --ignore-scripts` | Exit 1: registry audit endpoint unavailable inside the network-denied sandbox (`ENOTFOUND registry.npmjs.org`). This does not establish a public registry outage. |
| `npm audit --omit=dev --offline --ignore-scripts` | Printed “found 0 vulnerabilities”, exit 0. **Not a fresh advisory scan; not evidence of zero current vulnerabilities.** |
| Bounded audit assertions via Node stdin | Ten cases confirmed; details below. No source harness file retained. |

Runtime for local checks: Node **v22.14.0**, npm **10.9.2**. The lockfile selects Electron **45.1.0** (`app/package-lock.json:1061`); that version alone does not prove current support status.

Initial strict no-write test attempts ran with writes denied: 46 passed, 29 fixture tests stopped at unavailable/denied mkdtemp. These were audit-environment failures, not product regressions. After the user explicitly allowed temporary fixtures, the full baseline passed. The later branch failures are real regression assertions, distinct from those earlier environment failures.

Execution protection: `/usr/bin/sandbox-exec` denied all network and all filesystem writes except the single newly created temporary test root `/tmp/ulanzi-audit-tests.sCax0Z` (and its `/private/tmp` canonical spelling). Tests ran from an empty environment with explicit PATH, scratch HOME/TMPDIR/cache, npm log files disabled and Node heap capped at 256 MiB. Bounded harnesses also applied CPU 60 s, file-size 32768 shell blocks and open-file 256 limits. No installation or build occurred. The root was reserved for inert test fixtures, not the installed app or real configuration. No real Application Support directory was read or modified by the fixture harnesses.

### C. Additional bounded confirmation checks

The actual library methods were invoked; import scanning used the real function declarations from renderer/app.js evaluated in a VM without renderer bootstrap. Native actions were never run. Observations:

1. One-page fixture, `action:{type:'multi',steps:[{type:'command',value:'INERT_AUDIT_SENTINEL'}]}`: scanner returns zero; save/load creates `steps[0].action.type === 'command'` with no imported marker.
2. Save image-bearing config twice, corrupt primary: load reports backup and returns an icon beginning `file:`.
3. Write `[null, validPage]` without a backup: load throws through `_imageSlots` during recovery GC; primary already contains defaults.
4. Write current-version `pages:[]`: defaults returned, recovery flag null.
5. Select an inert plugin directory already at its managed destination: install throws and source no longer exists.
6. Scan an invalid-JSON plugin with no error listener: scanner throws through its error event.
7. Handle Ulanzi setGlobalSettings with persistence spy: zero save calls.
8. Resolve port promise null, request ensure twice: second call invokes spawn spy.
9. Generate null-payload SD bridge: connection function absent; non-null settings containing a closing-script sentinel remain escaped.
10. Run actual origin-guard body with literal null origin and register fixture UUID over fake EventEmitter transport: guard accepts and dummy globals are returned. No browser or real socket used.

An early combined harness accidentally included default sample command keys when checking the import count; it was corrected to one inert page. The next harness stopped on the unexpected recovery exception in case 3, which strengthened M9. Corrected remaining checks then passed. These harness-setup/result adjustments are not counted as app test-suite failures.

### D. Coverage map and untested paths

Baseline **75 tests / 17 files**:

| Test file | Count | Main exercised surface |
|---|---:|---|
| store.test.js | 16 | Schema, migration, image save/GC, basic backup/default reporting. |
| plugins.test.js | 6 | Ulanzi folder install/identity, selectdialog, replay UUID. |
| protocol.test.js | 5 | HID framing/padding/report splitting/decoding. |
| sdcatalog.test.js | 5 | Version/update resolution with stubbed releases. |
| import.test.js | 4 | Ulanzi mapping and one directory profile. |
| streamdeck.test.js | 4 | Scan/install, pending-port launch dedupe, Rosetta fixture, default-image restore. |
| plugin-protocol.test.js | 4 | File/MIME/HTML transform and lexical traversal. |
| iconpacks.test.js | 4 | Direct-child identifiers and containment. |
| shared-meta.test.js | 4 | MIME, geometry, action/media table consistency. |
| siteicon.test.js | 4 | Selected IP/hostname classifications and loopback refusal. |
| updates.test.js | 4 | Release parsing/status and notes. |
| version.test.js | 4 | Basic dotted/prerelease comparisons. |
| channels.test.js | 3 | Source-level declaration/registration matching. |
| paths.test.js | 3 | Lexical root/sibling/traversal containment. |
| actions.test.js | 2 | Benign/failing shell status reporting. |
| plugin-host.test.js | 2 | Tracked-child escalation and reloadOne action cleanup. |
| page.test.js | 1 | Wide-panel mode in generated ZIP. |

All 62 IPC request handlers and the separate POP event were read. The review traced host startup/spawn/reload/shutdown, both protocols, import/action persistence and key dispatch, update scheduling, network download/redirect guards, and build recipes. Main/ipc/plugin-hosts/preload/renderer still lack a comprehensive behavior harness. No numeric line-coverage claim is made. Source paths receiving only targeted inspection rather than full runtime verification include app-icon extraction, stats sampling, UI/CSS rendering, native hotkey/media behavior and packaging.

### E. Boundaries examined without an unsupported vulnerability claim

- **Custom schemes:** decoded paths undergo lexical containment before reads (`app/lib/plugin-protocol.js:25`); MIME is explicit. Symlinks are not resolved/no-follow checked, and the protocol uses blocking reads. No archive/symlink escape was executed. Installed native/Node plugins are already trusted user-authority code, so their filesystem authority is not presented as a new privilege escalation.
- **Archives:** SD lists/rejects unsafe names; generic/Ulanzi/profile/icon unzip paths rely more on system extraction. The previous audit's macOS zip-slip experiments are context, not fresh proof. No new confirmed zip-slip finding is made; expanded-resource enforcement is M18.
- **CORS:** `app/main.js:528` limits header relaxation by Ulanzi inspector frame scheme, not by destination loopback. It does not apply to sd-pi. The “only local services” rationale is broader in implementation than its prose; browser credential/CORS behavior and real services were not tested, so no cross-service theft claim is made.
- **Siteicon:** every redirect is rechecked against the hostname/DNS guard (`app/lib/siteicon.js:74`). IPv6 classification is incomplete: `::ffff:7f00:1` recurses with invalid tail `7f00:1`, and expanded loopback is not equal to `::1` (`app/lib/siteicon.js:30`). DNS checking and fetch resolve separately (`:60`, `:78`). An actual fetch bypass/rebinding result was not demonstrated; these remain validation work, not a reported successful SSRF exploit. Canonicalize address forms and bind requests to validated resolution in a future guarded-network test.
- **Native capture hotplug:** after first successful capture, the helper only waits for parent/termination (`app/native/hidseize.c:94`); there is no visible removal/reacquisition loop. Actual unplug/replug behavior and fallback typing require hardware validation and are not claimed observed.
- **Import image paths:** Ulanzi image import accepts absolute paths and extension-limited reads outside profile roots (`app/lib/import-ulanzi.js:239`). An untrusted file can nominate an image path, but automatic remote exfiltration was not established. Evaluate explicit profile/vendor image-root policy while preserving intended vendor asset import.
- **Preload/IPC trust:** resolved app-page identity is checked, not an explicit current-webContents identity. No route granting another window that preload and exact app page was confirmed. Do not call this an active sender bypass without such a route.
- **Dependencies:** no online Electron EOL/calendar or advisory source was consulted; GitHub/Ulanzi endpoints were not probed. `--omit=dev` excludes the Electron package despite its runtime relevance to the shipped app. A future online check must cover it and the packaging chain as well as runtime npm dependencies.
- **Build/DMG:** no build, code signing, notarization, DMG mounting, artifact download, installed-app launch or real permission/hardware exercise. The packaging exclusions and universal-helper compilation are source-verified recipes, not inspected artifact guarantees. Release uses `npm ci`, not `npm install`; tag/package-version identity is not independently enforced by a check in the reviewed release job.

The temporary fixture root was removed after verification, with an exact realpath/directory check before recursive removal. The report is the only retained audit artifact. The explicitly requested tests-only branch is separate deliverable work; no source remediation was included.
