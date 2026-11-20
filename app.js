const topics = { delivery: "Доставка", pricing: "Стоимость", other: "Другое" };
const thinkingMs = 300;
const form = document.querySelector("form");
const message = document.querySelector("#message");
const button = document.querySelector("button");
const notice = document.querySelector("#notice");
const topic = document.querySelector("#topic");
const draft = document.querySelector("#draft");

function clearMessage() {
  message.value = "";
}
clearMessage();
window.addEventListener("pageshow", () => {
  clearMessage();
  setTimeout(clearMessage, 0);
});

function clearResult() {
  notice.textContent = "";
  topic.textContent = "";
  draft.textContent = "";
}

function waitRemaining(started) {
  const left = thinkingMs - (Date.now() - started);
  if (left <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, left));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const started = Date.now();
  clearResult();
  notice.textContent = "Думаю...";
  button.disabled = true;
  try {
    const reply = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.value }),
    });
    const body = await reply.json();
    await waitRemaining(started);
    clearResult();
    if (body.status === "ready") {
      topic.textContent = `Тема: ${topics[body.topic] ?? body.topic}`;
      draft.textContent = body.draft;
      return;
    }
    notice.textContent = body.status === "manual_review"
      ? "Не удалось разобрать заявку автоматически. Ответьте клиенту вручную."
      : "Введите текст заявки.";
  } catch {
    await waitRemaining(started);
    clearResult();
    notice.textContent = "Не удалось разобрать заявку. Попробуйте ещё раз.";
  } finally {
    button.disabled = false;
  }
});
