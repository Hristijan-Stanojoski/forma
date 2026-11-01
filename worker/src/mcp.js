// Stateless MCP server (Streamable HTTP with plain JSON responses) for Claude and ChatGPT connectors.
import { json, cors } from './http.js';
import { TOOLS, callTool } from './tools.js';

const SERVER = { name: 'forma', version: '1.1.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  'Forma is Hristijan\'s personal fitness diary (goal: 100 kg to 80 kg, Modified UN diet four day rotation). ' +
  'When the user describes what they ate or drank, estimate calories and macros yourself and call log_food. ' +
  'Dates are Europe/Skopje local time. Always report what you logged and the remaining calories for the day.';

async function handleRpc(env, msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid request');
  if (id === undefined) return null; // notification, e.g. notifications/initialized
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(requested) ? requested : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const data = await callTool(env, params?.name, params?.arguments || {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    }
    case 'resources/list': return ok({ resources: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default: return err(-32601, 'Method not found: ' + method);
  }
}

export async function handleMcp(request, env) {
  if (request.method === 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', ...cors } });
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(env, m)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const res = await handleRpc(env, body);
  return res ? json(res) : new Response(null, { status: 202, headers: cors });
}
