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

function warn(message) {
  console.warn(`WARN: ${message}`);
}

if (!fs.existsSync(apiDir)) {
  console.log("OK: no existe carpeta api/; nada que validar.");
  process.exit(0);
}

const routeFiles = fs
  .readdirSync(apiDir)
  .filter((file) => file.endsWith(".js") && !file.startsWith("_"))
  .sort();

const count = routeFiles.length;

console.log(`OK: endpoints detectados en api/: ${count}/${FUNCTION_LIMIT}`);
routeFiles.forEach((file) => console.log(`- ${file}`));

if (routeFiles.includes("ai.js") && routeFiles.includes("catalog.js")) {
  warn(
    "api/ai.js es redundante en este storefront: el chat público ya usa /api/catalog con mode=assistant."
  );
}

if (count > FUNCTION_LIMIT) {
  fail(
    `El repositorio supera el límite de ${FUNCTION_LIMIT} Serverless Functions del plan Hobby.`
  );
}

console.log("OK: presupuesto de funciones dentro del límite.");