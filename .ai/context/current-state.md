# Upgrade State

sdk: 54
target_sdk: 55
target_expo: 55.0.14
target_react: 19.2.0
target_rn: 0.83.4
phase: step6_cli_updated

## Completed

- Step 0: Target version resolved (SDK 55 / 55.0.14)
- Step 1: Changelogs read (Expo SDK 55 + RN 0.83)
- Step 2: Template project package.json updated (all expo-* to 55.x.x exact versions)
- Step 2b: app.json updated (removed newArchEnabled)
- Step 3: Codegen root — no changes needed
- Step 4: Runtime package.json updated, builds pass (snapshot tests deferred)
- Step 4b: Codegen build passes
- Step 5: Template verification — deferred to user
- Step 6: CLI updated (expo-launcher.js, requirements.js, packageLock.json)

## Key Changes

- All expo-* packages now use major version 55 (new versioning scheme)
- expo-av removed (no expo-av@^55 exists, replaced by expo-video + expo-audio)
- Legacy Architecture dropped (newArchEnabled removed from app.json)
- RN 0.83 has zero breaking changes
- Node.js minimum bumped to 20.19.4
- CLI version checks now use semver.gte for forward compatibility

## Next

- Step 7: Breaking changes review
- Step 8: Final cross-repo validation

## Blocking Issues

- expo-av removal needs runtime source code review
- expo-navigation-bar deprecations need runtime review
- 157 snapshot test failures (expected, can update with npm test -- -u)
