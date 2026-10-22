```javascript
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

// =====================================
// SECURITY
// =====================================

app.disable("x-powered-by");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

// =====================================
// GEMINI CONFIGURATION
// =====================================

const apiKey = process.env.GEMINI_API_KEY?.trim();

const invalidKeyPlaceholders = [
  "your_gemini_api_key",
  "your_gemini_api_key_here",
  "paste_your_gemini_api_key_here"
];

const hasValidKey =
  Boolean(apiKey) &&
  !invalidKeyPlaceholders.includes(apiKey.toLowerCase());

const gemini = hasValidKey
  ? new GoogleGenAI({ apiKey })
  : null;

// =====================================
// 30 JARVIS AI MODULES
// =====================================

const modes = {
  chat: "Have a natural, helpful conversation.",
  nlu: "Understand meaning, intent, tone and requirements.",
  context: "Use available conversation context. Never invent personal information.",
  multiturn: "Understand follow-up messages using conversation history.",
  reasoning: "Solve logical problems carefully and explain important steps.",
  problem_solving: "Analyze problems and provide practical solutions.",
  plan: "Create a prioritized, step-by-step plan.",
  task_decompose: "Break complex tasks into actionable steps.",
  intent: "Identify the user's intent and desired outcome.",
  classify: "Classify the user's command and suggest an appropriate action.",
  followup: "Interpret follow-up questions using conversation history.",
  clarify: "Ask a concise question when a request is ambiguous.",
  personality: "Use a calm, intelligent, professional JARVIS personality.",
  identity: "Identify yourself as J.A.R.V.I.S., a personal AI assistant, not the actual movie character.",
  hindi: "Reply in natural Hindi using Devanagari script.",
  english: "Reply in clear, natural English.",
  hinglish: "Reply in natural Hinglish using Roman script.",
  translate: "Translate accurately while preserving meaning.",
  grammar: "Correct grammar and spelling without changing meaning.",
  summarize: "Summarize content accurately and preserve key details.",
  document: "Analyze document text supplied by the user. Do not claim to have read unavailable files.",
  math: "Solve mathematical problems carefully and explain the steps.",
  coding: "Write maintainable code and explain integration.",
  explain_code: "Explain code, functions, inputs and outputs.",
  debug: "Diagnose programming errors and suggest testable fixes.",
  ideas: "Generate useful ideas and practical next steps.",
  creative: "Create original writing matching the requested style.",
  research: "Help research questions and distinguish facts from uncertainty.",
  fact_check: "Evaluate claims carefully. Never invent evidence or citations.",
  structured: "Use appropriate headings, numbered steps, lists or tables."
};

const allowedModes = new Set(Object.keys(modes));
const allowedLanguages = new Set([
  "auto",
  "hi",
  "en",
  "hinglish"
]);

// =====================================
// RATE LIMIT
// =====================================

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Wait one minute and try again."
  }
});

// =====================================
// FRONTEND
// =====================================

app.use(express.static(PUBLIC_DIR, { index: false }));

function serveFrontend(_req, res) {
  res.sendFile(INDEX_FILE, error => {
    if (error && !res.headersSent) {
      console.error("Frontend error:", error.message);
      res.status(500).send(
        "JARVIS frontend not found. Check public/index.html."
      );
    }
  });
}

app.get("/", serveFrontend);
app.get("/assistant", serveFrontend);
app.get("/camera", serveFrontend);
app.get("/settings", serveFrontend);

// =====================================
// HEALTH CHECK
// GET /api/health
// =====================================

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");

  res.json({
    success: true,
    name: "J.A.R.V.I.S.",
    status: "online",
    provider: "Google Gemini",
    configured: Boolean(gemini),
    model: MODEL,
    features: allowedModes.size,
    webSearchEnabled:
      process.env.ENABLE_WEB_SEARCH?.trim().toLowerCase() === "true"
  });
});

// =====================================
// AI CHAT
// POST /api/chat
// =====================================

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const body = req.body ?? {};

    const message = body.message;
    const history = body.history ?? [];
    const mode = body.mode ?? "chat";
    const language = body.language ?? "auto";

    // Validate message.

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    if (message.length > 12000) {
      return res.status(413).json({
        error: "Message is too long. Maximum 12000 characters."
      });
    }

    // Validate conversation history.

    if (!Array.isArray(history) || history.length > 12) {
      return res.status(400).json({
        error: "Conversation history must contain at most 12 messages."
      });
    }

    // Validate module.

    if (typeof mode !== "string" || !allowedModes.has(mode)) {
      return res.status(400).json({
        error: "Unknown JARVIS module."
      });
    }

    // Validate language.

    if (
      typeof language !== "string" ||
      !allowedLanguages.has(language)
    ) {
      return res.status(400).json({
        error: "Unsupported language selection."
      });
    }

    // Check API key.

    if (!gemini) {
      return res.status(503).json({
        error: "Gemini API key is missing. Set GEMINI_API_KEY in Render Environment."
      });
    }

    // Convert conversation history into Gemini format.

    const safeHistory = history
      .filter(item =>
        item &&
        typeof item === "object" &&
        ["user", "assistant", "model"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-12)
      .map(item => ({
        role: item.role === "assistant" ? "model" : item.role,
        parts: [
          {
            text: item.content.slice(0, 12000)
          }
        ]
      }));

    // Select language.

    let languageInstruction =
      "Reply in the same language as the user. Support Hindi, English and Hinglish.";

    if (language === "hi" || mode === "hindi") {
      languageInstruction =
        "Reply in natural Hindi using Devanagari script.";
    } else if (language === "en" || mode === "english") {
      languageInstruction = "Reply in clear English.";
    } else if (language === "hinglish" || mode === "hinglish") {
      languageInstruction = "Reply in natural Hinglish using Roman script.";
    }

    // Prepare conversation.

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [
          {
            text: message.trim()
          }
        ]
      }
    ];

    // System instructions.

    const systemInstruction = [
      "You are J.A.R.V.I.S., a helpful futuristic personal AI assistant.",
      "Be accurate, practical, respectful and honest.",
      "Use relevant conversation history.",
      "Never claim to control devices without authorized integrations.",
      "Never reveal API keys, passwords or environment variables.",
      "Never invent facts, sources or citations.",
      languageInstruction,
      modes[mode]
    ].join("\n");

    // Optional Google Search grounding.

    const enableWebSearch =
      process.env.ENABLE_WEB_SEARCH?.trim().toLowerCase() === "true";

    const config = {
      systemInstruction,
      maxOutputTokens: 1800
    };

    if (enableWebSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    // Call Gemini.

    const response = await gemini.models.generateContent({
      model: MODEL,
      contents,
      config
    });

    const reply = response.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "Gemini returned an empty response. Please try again."
      });
    }

    return res.json({
      success: true,
      reply,
      mode,
      model: MODEL,
      provider: "Google Gemini"
    });

  } catch (error) {
    const status = Number(error?.status || error?.statusCode) || 0;

    // Log diagnostic information without exposing secrets to the client.
    console.error("JARVIS Gemini API error:", {
      status,
      message: String(error?.message || "Unknown error").slice(0, 500)
    });

    if (status === 400) {
      return res.status(502).json({
        error: "Gemini rejected the request. Check the model and request settings."
      });
    }

    if (status === 401 || status === 403) {
      return res.status(502).json({
        error: "Gemini authentication or access failed. Check GEMINI_API_KEY and model access."
      });
    }

    if (status === 429) {
      return res.status(503).json({
        error: "Gemini API rate limit or quota reached. Check your Google AI Studio usage and wait for the quota to reset."
      });
    }

    if (status === 404) {
      return res.status(502).json({
        error: "Gemini model not found. Check GEMINI_MODEL and model availability."
      });
    }

    if (status >= 500) {
      return res.status(503).json({
        error: "Gemini service is temporarily unavailable. Please try again."
      });
    }

    return res.status(502).json({
      error: "JARVIS could not get an AI response. Check Render Logs."
    });
  }
});

// =====================================
// UNKNOWN API ROUTES
// =====================================

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

// =====================================
// UNKNOWN PAGE ROUTES
// =====================================

app.use((_req, res) => {
  res.status(404).send(
    "404 - Page not found. Return to the JARVIS dashboard."
  );
});

// =====================================
// ERROR HANDLER
// =====================================

app.use((error, _req, res, _next) => {
  console.error("Server error:", error?.message || "Unknown error");

  if (res.headersSent) return;

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request is too large."
    });
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      error: "Invalid JSON request."
    });
  }

  return res.status(500).json({
    error: "Internal server error."
  });
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`J.A.R.V.I.S. running on port ${PORT}`);
  console.log(`Frontend: ${INDEX_FILE}`);
  console.log("AI provider: Google Gemini");
  console.log(`AI model: ${MODEL}`);
  console.log(`Gemini key configured: ${Boolean(gemini)}`);
  console.log(`AI modules: ${allowedModes.size}`);
});
```
