/**
 * Bounded JSON generation shared by the Worker classifier and listener answers.
 * v2.5.0: Gemini Flash first, then Groq; no tools, persistence, retries or action execution.
 * Keys travel only in headers. Provider errors and private prompts are never logged.
 */
export function aiProviders(env) {
  return [
    env.GEMINI_API_KEY ? "gemini" : null,
    env.GROQ_API_KEY ? "groq" : null,
  ].filter(Boolean);
}

export function parseAiJson(text) {
  try { return JSON.parse(text); } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
}

export async function requestAiJson(provider, env, { system, user, tokens, timeoutMs, onFailure = () => {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const gemini = provider === "gemini";
    const model = env.GEMINI_MODEL || "gemini-3.8-flash";
    const url = gemini
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      : "https://api.groq.com/openai/v1/chat/completions";
    const body = gemini ? {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: tokens + 512,
        responseMimeType: "application/json",
        thinkingConfig: model.startsWith("gemini-2.5-")
          ? { thinkingBudget: 0 }
          : { thinkingLevel: "low" },
      },
    } : {
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      temperature: 0,
      max_completion_tokens: tokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    };
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(gemini ? { "x-goog-api-key": env.GEMINI_API_KEY } : { authorization: `Bearer ${env.GROQ_API_KEY}` }),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      onFailure(`http_${response.status}`);
      return null;
    }
    const payload = await response.json();
    if (gemini) {
      const candidate = payload?.candidates?.[0];
      if (payload?.promptFeedback?.blockReason || candidate?.finishReason !== "STOP") return null;
      return parseAiJson(candidate.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join(""));
    }
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== "stop") return null;
    return parseAiJson(choice?.message?.content);
  } catch (error) {
    onFailure(error?.name === "AbortError" ? "timeout" : "request_failed");
    return null;
  }
  finally { clearTimeout(timer); }
}
