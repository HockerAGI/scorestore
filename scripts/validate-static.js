#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();

const requiredFiles = [
  "index.html",
  "success.html",
  "cancel.html",
  "legal.html",
  "robots.txt",
  "sitemap.xml",
  "sw.js",
  "css/styles.css",
  "css/override.css",
  "js/main.js",
  "js/success.js",
  "site.webmanifest",
];

const htmlFiles = ["index.html", "success.html", "cancel.html", "legal.html"];

const requiredManifestHref = "/site.webmanifest";
const requiredSwMarker = '"/site.webmanifest"';
const requiredDomain = "https://scorestore.vercel.app/";
const requiredSitemapUrl = "https://scorestore.vercel.app/sitemap.xml";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assertContains(file, needle, message) {
  const content = read(file);
  if (!content.includes(needle)) {
    fail(message);
  }
}

function assertRegex(file, regex, message) {
  const content = read(file);
  if (!regex.test(content)) {
    fail(message);
  }
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normalizeWhitespace(m[1]) : "";
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return m ? normalizeWhitespace(m[1]) : "";
}

function hasMetaDescription(html) {
  return /<meta\s+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(html);
}

function hasManifestLink(html) {
  return /<link\s+rel=["']manifest["'][^>]*href=["']\/site\.webmanifest["'][^>]*>/i.test(html);
}

for (const file of requiredFiles) {
  if (!exists(file)) {
    fail(`Falta el archivo requerido: ${file}`);
  }
}

for (const file of htmlFiles) {
  const html = read(file);

  if (!hasManifestLink(html)) {
    fail(`El archivo ${file} no apunta a /site.webmanifest`);
  }

  const canonical = extractCanonical(html);
  if (!canonical) {
    fail(`El archivo ${file} no tiene canonical`);
  }

  const title = extractTitle(html);
  if (!title) {
    fail(`El archivo ${file} no tiene title`);
  }

  if (!hasMetaDescription(html)) {
    fail(`El archivo ${file} no tiene meta description`);
  }

  if (!/meta\s+name=["']robots["'][^>]*content=["'][^"']*index|noindex/i.test(html)) {
    warn(`El archivo ${file} no declara robots explícitamente`);
  }

  if (canonical.includes("scorestore.vercel.app") === false) {
    fail(`El canonical de ${file} no usa el dominio esperado: ${canonical}`);
  }
}

const sw = read("sw.js");
if (!sw.includes(requiredSwMarker)) {
  fail("sw.js no precachea /site.webmanifest");
}

for (const asset of ["/site.webmanifest", "/robots.txt", "/sitemap.xml"]) {
  if (!asset.startsWith("/")) continue;
}

const robots = read("robots.txt");
if (!/User-agent:\s*\*/i.test(robots)) {
  fail("robots.txt no contiene User-agent: *");
}
if (!/Allow:\s*\/\s*/i.test(robots)) {
  fail("robots.txt no permite el sitio completo");
}
if (!new RegExp(`Sitemap:\\s+${requiredSitemapUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(robots)) {
  fail("robots.txt no declara el sitemap esperado");
}

const sitemap = read("sitemap.xml");
if (!sitemap.includes(requiredDomain)) {
  fail("sitemap.xml no referencia el dominio esperado");
}
if (!/<urlset[\s\S]*<\/urlset>/i.test(sitemap)) {
  fail("sitemap.xml no tiene estructura urlset válida");
}

assertContains("site.webmanifest", '"name"', "site.webmanifest no tiene campo name");
assertContains("site.webmanifest", '"start_url"', "site.webmanifest no tiene start_url");
assertContains("site.webmanifest", '"icons"', "site.webmanifest no tiene icons");

console.log("OK: estructura estática validada.");