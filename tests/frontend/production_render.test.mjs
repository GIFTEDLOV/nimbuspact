import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "../../app/node_modules/vite/dist/node/index.js";
import vue from "../../app/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { validateRuntimeConfiguration, NIMBUSPACT_V2_CONTRACT_ADDRESS, CANONICAL_BRADBURY_RPC } from "../../app/src/lib/nimbuspact.ts";

const require = createRequire(new URL("../../app/package.json", import.meta.url));
const { createSSRApp } = require("vue");
const { renderToString } = require("@vue/server-renderer");

test("production configuration accepts exact V2 and fails clearly for absent or mismatched addresses", () => {
  assert.equal(validateRuntimeConfiguration(NIMBUSPACT_V2_CONTRACT_ADDRESS, "testnetBradbury", CANONICAL_BRADBURY_RPC), "");
  for (const value of ["", "not-an-address", "0x0000000000000000000000000000000000000000"]) {
    assert.match(validateRuntimeConfiguration(value, "testnetBradbury", CANONICAL_BRADBURY_RPC), /VITE_CONTRACT_ADDRESS is missing or malformed/);
  }
  assert.match(validateRuntimeConfiguration("0xEAA6Cb19AcB1E81e729224c590a5Cd5060D0c934", "testnetBradbury", CANONICAL_BRADBURY_RPC), /rejected historical V1/);
  assert.match(validateRuntimeConfiguration("0x1111111111111111111111111111111111111111", "testnetBradbury", CANONICAL_BRADBURY_RPC), /must point to NimbusPact V2/);
});

test("actual App.vue renders V2 runtime binding without stale V1 warning or card", async () => {
  const env = { VITE_CONTRACT_ADDRESS: NIMBUSPACT_V2_CONTRACT_ADDRESS, VITE_GENLAYER_NETWORK: "testnetBradbury", VITE_GENLAYER_RPC_URL: CANONICAL_BRADBURY_RPC };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  let server;
  try {
    server = await createServer({ root: fileURLToPath(new URL("../../app/", import.meta.url)), configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false }, appType: "custom" });
    const { default: App } = await server.ssrLoadModule("/src/App.vue");
    const html = await renderToString(createSSRApp(App));
    assert.match(html, new RegExp(`data-runtime-binding[^>]*>${NIMBUSPACT_V2_CONTRACT_ADDRESS}<`));
    assert.match(html, /Testnet Bradbury/);
    assert.doesNotMatch(html, /Historical V1|rejected historical V1|Superseded rejected release|0xEAA6|unconfigured|\[object Object\]/i);
  } finally {
    await server?.close();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
