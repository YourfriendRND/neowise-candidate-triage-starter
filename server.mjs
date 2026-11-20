import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const clientScript = await readFile(new URL("./app.js", import.meta.url));
const files = {
  "/": { type: "text/html; charset=utf-8", body: html },
  "/app.js": { type: "text/javascript; charset=utf-8", body: clientScript },
};

const MODEL_TIMEOUT_MS = 300;
const TOPICS = new Set(["delivery", "pricing", "other"]);
const manualReview = { status: "manual_review", topic: null, draft: null };

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readRequestText(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { text } = payload;
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return text;
}

function readModelResult(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { topic, draft } = payload;
  if (!TOPICS.has(topic)) return null;
  if (typeof draft !== "string" || draft.trim().length === 0) return null;
  return { topic, draft };
}

async function classifyWithin(text) {
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  const pending = classify(text, { signal });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("model_timeout")), MODEL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
    pending.catch(() => {});
  }
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = readRequestText(Buffer.concat(chunks).toString("utf8"));
  if (text === null) return json(response, 400, { status: "invalid_input" });

  try {
    const result = readModelResult(await classifyWithin(text));
    if (!result) return json(response, 200, manualReview);
    return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft });
  } catch {
    return json(response, 200, manualReview);
  }
}

export function createApp() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && files[request.url]) {
      const file = files[request.url];
      response.writeHead(200, { "Content-Type": file.type });
      response.end(file.body);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      json(response, 500, { status: "server_error" });
    }
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  createApp().listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
