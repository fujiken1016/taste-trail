import { makeClient } from "../../src/qloo-client.js";
export const onRequestGet = ({ env }) =>
  new Response(JSON.stringify({ mode: makeClient(env).mode }), { headers: { "content-type": "application/json" } });
