#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const apiDir = path.join(root, "api");
const handlersDir = path.join(root, "lib", "handlers");
const sharedFile = path.join(root, "lib", "_shared.js");

const VERCEL_LIMIT = 12;
const TARGET_COUNT = 1;

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function walkJsFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(full, base));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(path.relative(base, full).replaceAll(path.sep, "/"));
    }
  }
  return out;
}

if (!fs.existsSync(apiDir)) {
  console.log("OK: no existe carpeta api/; nada que validar.");
  process.exit(0);
}

const apiFiles = walkJsFiles(apiDir).sort();
const handlerFiles = fs.existsSync(handlersDir) ? walkJsFiles(handlersDir).sort() : [];
const count = apiFiles.length;

console.log(`\n── Vercel Function Budget ──────────────────────────────`);
console.log(`   Archivos JS en /api/: ${count} (límite Vercel: ${VERCEL_LIMIT}, target: ${TARGET_COUNT})`);

for (const f of apiFiles) {
  const isExpected = f === "index.js";
  console.log(`   ${isExpected ? "✅" : "⚠️ "} api/${f}`);
}

if (handlerFiles.length > 0) {
  console.log(`\n   Handlers en /lib/handlers/: ${handlerFiles.length}`);
  for (const f of handlerFiles) {
    console.log(`   ✅ lib/handlers/${f}`);
  }
}

if (!fs.existsSync(sharedFile)) {
  warn("Falta lib/_shared.js, requerido por api/index.js.");
}

console.log(`────────────────────────────────────────────────────────\n`);

if (count > VERCEL_LIMIT) {
  fail(
    `Superado el límite de ${VERCEL_LIMIT} Serverless Functions del plan Hobby.\n` +
      `Tienes ${count} archivos en /api/. Deja solo api/index.js y mueve el resto a /lib/handlers/.`
  );
}

if (count > TARGET_COUNT) {
  warn(
    `Se detectaron ${count} archivos JS en /api/ (target = ${TARGET_COUNT}).\n` +
      `Solo api/index.js debería vivir ahí en tu arquitectura centralizada.`
  );
}

console.log("OK: presupuesto de funciones dentro del límite.\n");