#!/usr/bin/env node
"use strict";

/**
 * check-api-budget.js
 * ────────────────────
 * Verifica que /api/ tenga como máximo 1 archivo JS (index.js).
 * En Vercel Hobby, TODOS los .js en /api/ cuentan como Serverless Functions,
 * incluyendo los prefijados con _ . El límite del plan es 12.
 * Nuestra arquitectura usa 1 función central (index.js) + handlers en /lib/handlers/.
 */

const fs   = require("fs");
const path = require("path");

const root          = process.cwd();
const apiDir        = path.join(root, "api");
const handlersDir   = path.join(root, "lib", "handlers");
const VERCEL_LIMIT  = 12;  // Límite hard de Vercel Hobby
const TARGET_COUNT  = 1;   // Nuestro target: solo index.js en /api/

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

const apiFiles     = walkJsFiles(apiDir).sort();
const handlerFiles = fs.existsSync(handlersDir) ? walkJsFiles(handlersDir).sort() : [];
const count        = apiFiles.length;

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
console.log(`────────────────────────────────────────────────────────\n`);

if (count > VERCEL_LIMIT) {
  fail(
    `Superado el límite de ${VERCEL_LIMIT} Serverless Functions del plan Hobby.\n` +
    `  Tienes ${count} archivos en /api/. Mueve los handlers a /lib/handlers/.`
  );
}

if (count > TARGET_COUNT) {
  warn(
    `Se detectaron ${count} archivos JS en /api/ (target = ${TARGET_COUNT}).\n` +
    `  Solo index.js debería vivir en /api/.\n` +
    `  Los handlers con prefijo _ deben ir en /lib/handlers/ para no consumir cuota de Vercel.`
  );
  // No es un error fatal — es una advertencia. El deploy puede proceder si count <= 12.
}

console.log("OK: presupuesto de funciones dentro del límite.\n");
