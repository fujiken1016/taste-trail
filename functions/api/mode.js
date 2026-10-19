import { getMode } from "../../src/handler.js";
export const onRequestGet = ({ env }) => new Response(JSON.stringify({ mode: getMode(env) }), { headers: { "content-type": "application/json" } });
