---
name: upgrading-expo
description: Upgrade Expo SDK across WaveMaker RN ecosystem
version: 6.0.0
---

## References

- ./references/common/new-architecture.md -- SDK +53
- ./references/common/react-19.md -- SDK +54
- ./references/common/react-compiler.md -- SDK +54

## Context

- State tracker: `.ai/context/current-state.md` — read at start, update after each phase.
- Platform rules auto-loaded from `.cursor/rules/platform.mdc`.

## Version Resolution Strategy

**Compatibility first. Do not blindly upgrade to latest.** Pick versions that are known to be compatible with the target Expo SDK and React Native version:

1. Resolve the target Expo release first (`EXPO_TARGET_VERSION`) and use Expo's compatibility set as the source of truth for `expo-*` and tightly-coupled RN ecosystem packages.
2. For `expo-*` packages: prefer versions from `expo@<target>.bundledNativeModules` (or `expo@<target>` dependencies when bundled data is missing) instead of latest npm versions.
3. For all other packages (`react-native-*`, `@react-native/*`, `@react-navigation/*`, community packages, etc.): choose the highest version whose peer dependencies include the target `react`, `react-native`, and `expo` ranges. Do not choose a version only because it is newest.
4. For transitive deps that are also direct deps (e.g. `expo-modules-core`): match the version required by `expo@<target>`.
5. **Exception — `@react-native/*` scoped packages**: must match the React Native version line (e.g. `@react-native/assets-registry@0.83.x` for RN `0.83.x`).
6. Pin exact versions (no `~` or `^`) unless the user says otherwise.
7. Ignore upgrading this package versions (`victory-native`).

### Stability Gate

Only use a package version that has been published for **at least 5 days**. Check publish date with:
```bash
npm view <pkg>@<version> time --json | grep '<version>'
```
If the version was published less than 5 days ago, fall back to the previous stable version that meets the 5-day threshold. This avoids adopting freshly-published versions that may have undiscovered issues.

### Compatibility Verification

Before finalizing versions, verify each package's peer dependencies include the target `expo`, `react`, and `react-native` versions. Batch-check with:
```bash
npm view <pkg>@<version> peerDependencies --json
```
If a peer says `react-native: "0.84 - 0.86"` but we target `0.83`, that version is **not compatible** — find the highest version whose peer range includes `0.83`.

After dependency updates in template/generated app, run:
```bash
npx expo-doctor
npx expo install --fix
```
Use these as mandatory compatibility checks to align package versions with Expo expectations.

### Handling Peer Dependency Conflicts

- **Never use `--legacy-peer-deps`** for `npm install`. Instead, resolve peer conflicts properly by adding the conflicting resolution to the `"overrides"` section in `package.json` to force the desired version.
- Only fall back to an older version if the latest causes **runtime errors** (not just peer warnings).
- Document any overrides added in the upgrade state tracker.

## Step 0: Get Target Version

Ask user for target SDK. Resolve `EXPO_SDK_MAJOR` and `EXPO_TARGET_VERSION` (`npm view expo@^{MAJOR} version`). Run `bash ./scripts/resolve-expo-versions.sh <MAJOR>` to discover available versions for all expo-* packages. Update `.ai/context/current-state.md`.

## Step 1: Read Changelogs

Fetch `https://expo.dev/changelog/sdk-{EXPO_SDK_MAJOR}` (major only in URL). Extract: expo/react/RN versions, breaking changes, module updates.

Find RN blog post from Expo changelog or `https://reactnative.dev/blog`. When RN version changes, `@react-native/*` scoped packages must match.

## Step 2: Update Template Project (CONFIRM before next step)

Path: `wavemaker-rn-codegen/src/templates/project/`

- **`package.json`**: Update core versions + all deps. Read file for full list. Follow **Version Resolution Strategy** above. Check `overrides`. Include `expo-modules-core` as a direct dependency. **Before removing any package**, search all three repos for imports/usages; if found, notify user and wait for confirmation before removing.
- **`app.json`**: Check plugins, deprecated keys, `newArchEnabled`/`jsEngine`.
- **`metro.config.js`**: Check `expo/metro-config` API, transformer, SVG transformer compat.
- **Other**: Check `plugins/expo-screen-capture-plugin/package.json` peer dep.

**After updating, Wait for explicit confirmation before proceeding to Step 3.**

## Step 3: Update Codegen Root (CONFIRM before next step)

`wavemaker-rn-codegen/package.json` — review `@babel/*` and tooling deps.

**After updating, Wait for confirmation before proceeding to Step 4.**

## Step 4: Update Runtime (CONFIRM before next step)

`wavemaker-rn-runtime/package.json` — match all shared deps to template. Read file for full list.

**After updating, Wait for explicit confirmation before proceeding to build.**

### Build & yalc-publish

```bash
cd wavemaker-rn-runtime && npm install && npm run build && npm test
cd wavemaker-rn-codegen && npm install && npm run build && npm test
```

## Step 5: Update CLI (CONFIRM before next step)

- **`templates/package/packageLock.json`**: Regenerate from template project (`npm install --package-lock-only`), copy here.
- **`src/requirements.js`**: Update version floors (e.g. Node.js minimum from Expo changelog).
- **`src/expo-launcher.js`**: Add new SDK version handling. Use `semver.gte(semver.coerce(...))` for forward-compatible checks. Review `updatePackageJsonFile()`, `updateReanimatedPlugin()`, `barcodePort`.

**After updating, Wait for confirmation before proceeding to Step 6.**

## Step 6: Verify Template (BLOCKING)

Run `./scripts/run.sh --help` for commands. Verification types:
1. Web preview (expo) — `./scripts/run.sh web-preview <url> --clean`
2. Web preview (esbuild) — `./scripts/run.sh web-preview <url> --esbuild --clean`
3. Sync (Expo Go) — `./scripts/run.sh sync <url> --clean`
4. Android build — `./scripts/run.sh build android <src>`
5. iOS build — `./scripts/run.sh build ios <src>`

**This step is a gate. Do NOT proceed to Step 7 until the user explicitly provides pass/fail status for web-preview, sync, and build.** Ask the user for results and wait. If any verification fails, diagnose and fix in earlier steps, rebuild, and re-verify before moving on.

## Step 7: Breaking Changes

Search all three repos for affected code. Present to user with proposed fix. **Wait for confirmation before applying.**

## Step 8: Final Validation

Run `bash ./scripts/validate-versions.sh` for cross-repo alignment. Then: runtime build+test, codegen build+test, CLI e2e test.

Update `.ai/context/current-state.md` with final status.
Once upgrade is completed, update the user.
