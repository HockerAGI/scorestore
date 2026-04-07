#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const apiDir = path.join(root, "api");
const FUNCTION_LIMIT = 12;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
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

const routeFiles = walkJsFiles(apiDir).sort();
const count = routeFiles.length;

console.log(`OK: archivos JS detectados en api/: ${count}/${FUNCTION_LIMIT}`);
for (const file of routeFiles) {
  console.log(`- ${file}`);
}

if (count > FUNCTION_LIMIT) {
  fail(`El repositorio supera el límite de ${FUNCTION_LIMIT} Serverless Functions del plan Hobby.`);
}

console.log("OK: presupuesto de funciones dentro del límite.");