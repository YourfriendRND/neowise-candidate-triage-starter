import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function post(base, text) {
  const started = Date.now();
  const reply = await fetch(`${base}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return {
    status: reply.status,
    body: await reply.json(),
    elapsed: Date.now() - started,
  };
}

test("timeout falls back to manual review within the model limit", async () => {
  const server = createApp();
  const port = await listen(server);
  try {
    const result = await post(`http://127.0.0.1:${port}`, "заявка [timeout]");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "manual_review", topic: null, draft: null });
    assert.ok(result.elapsed < 1000, `waited ${result.elapsed}ms`);
  } finally {
    await close(server);
  }
});

test("blank text is rejected", async () => {
  const server = createApp();
  const port = await listen(server);
  try {
    for (const text of ["", "\n"]) {
      const result = await post(`http://127.0.0.1:${port}`, text);
      assert.equal(result.status, 400);
      assert.deepEqual(result.body, { status: "invalid_input" });
    }
  } finally {
    await close(server);
  }
});
