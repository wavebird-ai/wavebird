import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

type PackageJson = {
  exports?: Record<string, string | Record<string, string>>;
};

const sdkDir = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(sdkDir, "package.json"), "utf8")) as PackageJson;

async function assertFile(relativePath: string): Promise<string> {
  const filePath = path.join(sdkDir, relativePath);
  const fileStat = await stat(filePath);
  assert.equal(fileStat.isFile(), true, `${relativePath} should exist`);
  assert.ok(fileStat.size > 0, `${relativePath} should not be empty`);
  return readFile(filePath, "utf8");
}

function assertRuntimeExports(moduleName: string, module: Record<string, unknown>, exportNames: string[]): void {
  for (const exportName of exportNames) {
    assert.ok(exportName in module, `${moduleName} should export ${exportName}`);
    assert.notEqual(module[exportName], undefined, `${moduleName}.${exportName} should be defined`);
  }
}

function assertDeclarationContains(relativePath: string, body: string, markers: string[]): void {
  for (const marker of markers) {
    assert.ok(body.includes(marker), `${relativePath} should contain ${marker}`);
  }
}

const expectedExports: Record<string, string | Record<string, string>> = {
  ".": {
    types: "./dist/sdk/src/index.d.ts",
    browser: "./dist/sdk/src/browser.js",
    import: "./dist/sdk/src/index.js",
    default: "./dist/sdk/src/index.js",
  },
  "./react": {
    types: "./dist/sdk/src/components/WavebirdAd.d.ts",
    import: "./dist/sdk/src/components/WavebirdAd.js",
    default: "./dist/sdk/src/components/WavebirdAd.js",
  },
  "./mount": {
    types: "./dist/sdk/src/components/mountWavebirdAd.d.ts",
    import: "./dist/sdk/src/components/mountWavebirdAd.js",
    default: "./dist/sdk/src/components/mountWavebirdAd.js",
  },
  "./consent": {
    types: "./dist/sdk/src/consent/index.d.ts",
    import: "./dist/sdk/src/consent/index.js",
    default: "./dist/sdk/src/consent/index.js",
  },
  "./consent/react": {
    types: "./dist/sdk/src/consent/react.d.ts",
    import: "./dist/sdk/src/consent/react.js",
    default: "./dist/sdk/src/consent/react.js",
  },
  "./browser": {
    types: "./dist/sdk/src/browser.d.ts",
    import: "./dist/sdk/src/browser.js",
    default: "./dist/sdk/src/browser.js",
  },
  "./public-contracts": {
    types: "./dist/sdk/src/public_contracts.d.ts",
    import: "./dist/sdk/src/public_contracts.js",
    default: "./dist/sdk/src/public_contracts.js",
  },
  "./public-contracts/wrapper": {
    types: "./dist/sdk/src/public_contracts/wrapper.d.ts",
    import: "./dist/sdk/src/public_contracts/wrapper.js",
    default: "./dist/sdk/src/public_contracts/wrapper.js",
  },
  "./public-contracts/ssp": {
    types: "./dist/sdk/src/public_contracts/ssp.d.ts",
    import: "./dist/sdk/src/public_contracts/ssp.js",
    default: "./dist/sdk/src/public_contracts/ssp.js",
  },
  "./package.json": "./package.json",
};

assert.deepEqual(packageJson.exports, expectedExports);

for (const target of Object.values(expectedExports)) {
  if (typeof target === "string") {
    await assertFile(target);
    continue;
  }
  await assertFile(target.types);
  await assertFile(target.import);
  await assertFile(target.default);
  if ("browser" in target) {
    await assertFile(target.browser);
  }
}

async function importFromSdk(relativePath: string): Promise<Record<string, unknown>> {
  return await import(pathToFileURL(path.join(sdkDir, relativePath)).href) as Record<string, unknown>;
}

const mainEntry = await importFromSdk("dist/sdk/src/index.js");
const browserEntry = await importFromSdk("dist/sdk/src/browser.js");
const reactEntry = await importFromSdk("dist/sdk/src/components/WavebirdAd.js");
const mountEntry = await importFromSdk("dist/sdk/src/components/mountWavebirdAd.js");
const consentEntry = await importFromSdk("dist/sdk/src/consent/index.js");
const consentReactEntry = await importFromSdk("dist/sdk/src/consent/react.js");
const publicContractsEntry = await importFromSdk("dist/sdk/src/public_contracts.js");
const wrapperContractsEntry = await importFromSdk("dist/sdk/src/public_contracts/wrapper.js");
const sspContractsEntry = await importFromSdk("dist/sdk/src/public_contracts/ssp.js");

assert.deepEqual(Object.keys(mainEntry).sort(), [
  "WavebirdClient",
  "WavebirdSdkError",
  "WavebirdSdkErrorCode",
  "normalizeWavebirdPlacement",
  "resolveAdTimingPlan",
]);
assert.deepEqual(Object.keys(browserEntry).sort(), [
  "WavebirdClient",
  "WavebirdSdkError",
  "WavebirdSdkErrorCode",
  "normalizeWavebirdPlacement",
  "resolveAdTimingPlan",
]);
assert.equal(typeof mainEntry.WavebirdClient, "function");
assert.equal(typeof browserEntry.WavebirdClient, "function");
assert.equal((mainEntry.WavebirdClient as { name: string }).name, "WavebirdClient");
assert.equal((browserEntry.WavebirdClient as { name: string }).name, "WavebirdClient");
assert.notEqual(mainEntry.WavebirdClient, browserEntry.WavebirdClient, "root and browser WavebirdClient are parallel public surfaces");
assert.equal(mainEntry.WavebirdSdkError, browserEntry.WavebirdSdkError);
assert.equal(mainEntry.WavebirdSdkErrorCode, browserEntry.WavebirdSdkErrorCode);
assert.equal(typeof mainEntry.resolveAdTimingPlan, "function");
assert.equal(typeof browserEntry.normalizeWavebirdPlacement, "function");

assertRuntimeExports("wavebird/react", reactEntry, ["WavebirdAd"]);
assertRuntimeExports("wavebird/mount", mountEntry, ["mountWavebirdAd"]);
assertRuntimeExports("wavebird/consent/react", consentReactEntry, ["ConsentDialog"]);
assertRuntimeExports("wavebird/consent", consentEntry, [
  "CONSENT_RECORD_VERSION",
  "CONSENT_REQUIRED_ZONES",
  "CONSENT_STORAGE_KEY",
  "clearConsent",
  "getAcceptAllPurposes",
  "getBasicAdsOnlyPurposes",
  "getConsent",
  "getDefaultConsentPurposes",
  "mountConsentDialog",
  "needsRefresh",
  "parseTcfString",
  "requiresConsentCollection",
  "resolveConsentLocale",
  "setConsent",
]);
assertRuntimeExports("wavebird/public-contracts", publicContractsEntry, [
  "WRAPPER_INGRESS_CREATE_CONTRACT_VERSION",
  "isCslWrapperIngressCreateRequestV1",
  "SSP_DECISION_INGRESS_CONTRACT_VERSION",
  "isCslSspDecisionIngressV1",
  "PUBLIC_DECISION_DELIVERY_MODES",
  "isPublicDecisionDeliveryMode",
]);
assertRuntimeExports("wavebird/public-contracts/wrapper", wrapperContractsEntry, [
  "WRAPPER_INGRESS_CREATE_CONTRACT_VERSION",
  "WRAPPER_BEACON_CONTRACT_VERSION",
  "WRAPPER_GENERATION_EVENT_CONTRACT_VERSION",
  "isCslWrapperIngressCreateRequestV1",
  "isCslWrapperBeaconRequestV1",
  "isWrapperContractVersion",
]);
assertRuntimeExports("wavebird/public-contracts/ssp", sspContractsEntry, [
  "SSP_DECISION_INGRESS_CONTRACT_VERSION",
  "SSP_DECISION_RESPONSE_CONTRACT_VERSION",
  "SSP_SLOT_SIGNAL_CONTRACT_VERSION",
  "isCslSspDecisionIngressV1",
  "isCslSspDecisionResponseV1",
  "isPublicSspReasonOrigin",
]);

assertDeclarationContains("dist/sdk/src/index.d.ts", await assertFile("dist/sdk/src/index.d.ts"), [
  "WavebirdClientOptions",
  "ConsentFlags",
  "DecisionDeliveryMode",
  "JobRequest",
  "DecisionResponse",
  "BeaconRequest",
  "AdTimingPlan",
  "ConsentDecision",
  "StoredConsentRecord",
]);
assertDeclarationContains("dist/sdk/src/browser.d.ts", await assertFile("dist/sdk/src/browser.d.ts"), [
  "WavebirdClientOptions",
  "ConsentFlags",
  "DecisionDeliveryMode",
  "JobRequest",
  "DecisionResponse",
  "BeaconResponse",
  "AdTimingPlan",
]);
assertDeclarationContains("dist/sdk/src/components/WavebirdAd.d.ts", await assertFile("dist/sdk/src/components/WavebirdAd.d.ts"), [
  "WavebirdAdProps",
  "NativeAsset",
  "WavebirdNativeRenderProps",
]);
assertDeclarationContains(
  "dist/sdk/src/components/mountWavebirdAd.d.ts",
  await assertFile("dist/sdk/src/components/mountWavebirdAd.d.ts"),
  ["MountWavebirdAdOptions", "mountWavebirdAd"]
);
assertDeclarationContains("dist/sdk/src/consent/index.d.ts", await assertFile("dist/sdk/src/consent/index.d.ts"), [
  "ConsentDecision",
  "ConsentPurposes",
  "SetConsentOptions",
  "StoredConsentRecord",
  "ParsedWavebirdTcfString",
  "MountConsentDialogOptions",
]);
assertDeclarationContains("dist/sdk/src/consent/react.d.ts", await assertFile("dist/sdk/src/consent/react.d.ts"), [
  "ConsentDialogProps",
]);

const readme = await assertFile("README.md");
for (const documentedPath of [
  "wavebird",
  "wavebird/browser",
  "wavebird/react",
  "wavebird/mount",
  "wavebird/consent",
  "wavebird/consent/react",
  "wavebird/public-contracts",
  "wavebird/public-contracts/wrapper",
  "wavebird/public-contracts/ssp",
]) {
  assert.ok(readme.includes(documentedPath), `README should document ${documentedPath}`);
}

assertDeclarationContains("examples/package-node.mjs", await assertFile("examples/package-node.mjs"), [
  'from "wavebird"',
]);
assertDeclarationContains("examples/package-browser.js", await assertFile("examples/package-browser.js"), [
  'from "wavebird/browser"',
]);
assertDeclarationContains("examples/public-contracts.mjs", await assertFile("examples/public-contracts.mjs"), [
  'from "wavebird/public-contracts"',
]);

console.log("sdk/export-shape.test.ts ok");
