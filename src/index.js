const KV_KEY = "daily-todo-data";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/data") {
      if (request.method === "GET") {
        const value = await env.TRACKING_TASK_KV.get(KV_KEY);
        return new Response(value || "{}", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        });
      }

      if (request.method === "POST") {
        let body;
        try {
          body = await request.text();
          // Validate it's valid JSON before storing
          JSON.parse(body);
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS_HEADERS },
          });
        }

        await env.TRACKING_TASK_KV.put(KV_KEY, body);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
