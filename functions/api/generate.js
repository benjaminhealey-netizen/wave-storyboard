/**
 * Cloudflare Pages Function: /api/generate
 *
 * Proxies requests to the Anthropic API so the API key
 * never touches the browser. Set ANTHROPIC_API_KEY as a
 * Cloudflare Pages environment variable (encrypted).
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers — tighten the origin in production if you want
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Parse the incoming prompt from the frontend
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Call Anthropic
  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to reach Anthropic API" }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text();
    return new Response(JSON.stringify({ error: `Anthropic error: ${anthropicRes.status}`, detail: errBody }), {
      status: anthropicRes.status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const data = await anthropicRes.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Handle preflight OPTIONS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
