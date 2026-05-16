import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Agent, CursorAgentError, type SDKAgent } from "@cursor/sdk";
import { Bot } from "grammy";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CURSOR_API_KEY = process.env.CURSOR_API_KEY;
const CURSOR_LOCAL_CWD = process.env.CURSOR_LOCAL_CWD;
const CURSOR_MODEL_ID = process.env.CURSOR_MODEL_ID || "composer-2";
/** Composer 2: `high` = più ragionamento (più lento); `low` più veloce. Vedi Cursor SDK `model.params`. */
const CURSOR_MODEL_THINKING = (process.env.CURSOR_MODEL_THINKING || "").trim().toLowerCase();

function buildModelSelection(): { id: string; params?: { id: string; value: string }[] } {
  const thinking =
    CURSOR_MODEL_THINKING === "high" || CURSOR_MODEL_THINKING === "medium" || CURSOR_MODEL_THINKING === "low"
      ? CURSOR_MODEL_THINKING
      : undefined;
  if (thinking) {
    return { id: CURSOR_MODEL_ID, params: [{ id: "thinking", value: thinking }] };
  }
  return { id: CURSOR_MODEL_ID };
}

const allowed = new Set(
  (process.env.ALLOWED_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n)),
);

function requireEnv(): void {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN mancante");
  if (!CURSOR_API_KEY) throw new Error("CURSOR_API_KEY mancante");
  if (!CURSOR_LOCAL_CWD) throw new Error("CURSOR_LOCAL_CWD mancante");
  if (allowed.size === 0) {
    throw new Error(
      "ALLOWED_TELEGRAM_IDS vuoto: imposta i tuoi user id Telegram (virgola-separati).",
    );
  }
}

requireEnv();

const resolvedCwd = path.resolve(CURSOR_LOCAL_CWD!);
if (!fs.existsSync(resolvedCwd)) {
  throw new Error(`CURSOR_LOCAL_CWD non esiste: ${resolvedCwd}`);
}

/** Un agente Cursor per chat Telegram (contesto multi-turn). */
const agents = new Map<number, SDKAgent>();

async function disposeAgent(chatId: number): Promise<void> {
  const a = agents.get(chatId);
  if (a) {
    await a[Symbol.asyncDispose]();
    agents.delete(chatId);
  }
}

async function getAgent(chatId: number): Promise<SDKAgent> {
  let a = agents.get(chatId);
  if (!a) {
    a = await Agent.create({
      apiKey: CURSOR_API_KEY!,
      model: buildModelSelection(),
      local: { cwd: resolvedCwd },
    });
    agents.set(chatId, a);
  }
  return a;
}

function chunkForTelegram(text: string, max = 4000): string[] {
  if (!text) return ["(vuoto)"];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    parts.push(text.slice(i, i + max));
  }
  return parts;
}

const bot = new Bot(TELEGRAM_BOT_TOKEN!);

bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (uid == null || !allowed.has(uid)) {
    if (ctx.chat?.type === "private") {
      await ctx.reply(`Accesso negato. Il tuo user id: ${uid ?? "n/d"}`);
    }
    return;
  }
  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "Bot Cursor (SDK locale).",
      `Workspace: \`${resolvedCwd}\``,
      `Modello: \`${JSON.stringify(buildModelSelection())}\``,
      "",
      "Invia un messaggio = prompt per l’agente.",
      "/new — nuova sessione (reset contesto).",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
});

bot.command("new", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId == null) return;
  await disposeAgent(chatId);
  await ctx.reply("Sessione azzerata. Scrivi il prossimo prompt.");
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  const chatId = ctx.chat?.id;
  if (chatId == null) return;

  const prompt = ctx.message.text.trim();
  if (!prompt) return;

  console.log(`[telegram-cursor-bot] prompt chat=${chatId} len=${prompt.length}`);

  await ctx.api.sendChatAction(chatId, "typing");
  await ctx.reply(
    "Ricevuto. Avvio agente Cursor sul repo (thinking high → può richiedere diversi minuti).",
  );

  const agent = await getAgent(chatId);
  let collected = "";

  try {
    const run = await agent.send(prompt);
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") collected += block.text;
        }
      }
    }
    const result = await run.wait();
    if (result.status === "error") {
      await ctx.reply(`Run fallita (id: ${result.id}). Controlla i log Cursor / transcript.`);
      return;
    }
    const tail =
      typeof result.result === "string" && result.result.trim()
        ? `\n\n---\n${result.result}`
        : "";
    const out = (collected + tail).trim() || "(nessun testo dalla risposta)";
    for (const part of chunkForTelegram(out)) {
      await ctx.reply(part);
    }
  } catch (e) {
    if (e instanceof CursorAgentError) {
      await ctx.reply(`Cursor SDK: ${e.message} (retryable=${e.isRetryable})`);
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.reply(`Errore: ${msg}`);
  }
});

bot.catch((err) => {
  console.error("[telegram-cursor-bot]", err);
});

process.on("SIGINT", async () => {
  for (const id of [...agents.keys()]) {
    await disposeAgent(id);
  }
  process.exit(0);
});

console.log(`Avvio bot. Workspace Cursor: ${resolvedCwd}`);
await bot.start();
console.log(
  "In ascolto su Telegram (long polling). Non è bloccato: apri il bot e invia /start. Ctrl+C per uscire.",
);
