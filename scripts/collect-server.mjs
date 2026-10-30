#!/usr/bin/env node
// 指紋收集器：把瀏覽器算好的結構指紋直接落地，避免 agent 逐次貼 5KB JSON。
// 用法：node scripts/collect-server.mjs [port]   （預設 8766）
// 瀏覽器端：await fetch("http://127.0.0.1:8766/fingerprint?label=phase3",{method:"POST",body:JSON.stringify(fp)})
// 只寫 .baseline/fingerprint.<label>.json，其他路徑一律 404；零相依、僅本機監聽。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, ".baseline");
const PORT = Number(process.argv[2] || 8766);

const send = (res, code, text) => {
  res.writeHead(code, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(text);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204, "");
  if (req.method !== "POST" || url.pathname !== "/fingerprint") return send(res, 404, JSON.stringify({ ok: false, error: "只有 POST /fingerprint?label=<name>" }));

  const label = (url.searchParams.get("label") || "unnamed").replace(/[^a-zA-Z0-9._-]/g, "_");
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 8_000_000) req.destroy();
  });
  req.on("end", () => {
    let fp;
    try {
      fp = JSON.parse(body);
    } catch (e) {
      return send(res, 400, JSON.stringify({ ok: false, error: "body 不是合法 JSON：" + e.message }));
    }
    if (!fp || !fp.kit || typeof fp.kit.total !== "number") {
      return send(res, 400, JSON.stringify({ ok: false, error: "指紋缺少 kit.total，可能擷取中途失敗" }));
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `fingerprint.${label}.json`);
    fs.writeFileSync(file, JSON.stringify(fp, null, 1) + "\n");
    send(res, 200, JSON.stringify({ ok: true, file: path.relative(ROOT, file), kitTotal: fp.kit.total, districts: fp.data && fp.data.districts }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`指紋收集器就緒：http://127.0.0.1:${PORT}/fingerprint?label=<phase>  →  ${path.relative(ROOT, OUT_DIR)}/`);
});
