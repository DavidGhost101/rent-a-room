#!/usr/bin/env node
/**
 * Copy the website frontend (public/) into the Android WebView shell
 * (android-app/www/), then re-inject the one line the native app needs.
 *
 * WHY: android-app/www/index.html was a hand-made copy of public/index.html.
 * Every frontend change had to be applied twice, and when it was not, the
 * website and the installed Android app quietly showed different content.
 * A tenant reading the safety guide in the app could be reading an older
 * version than the one on the site. This script makes the copy mechanical.
 *
 * The only intended difference is config.js, which gives the native app an
 * absolute API base URL. On the website that file is never loaded, so
 * requests stay relative to whatever domain serves the page.
 *
 * Run: npm run sync:android   (and always before `npx cap sync android`)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const DEST = path.join(ROOT, 'android-app', 'www');
const CONFIG_TAG = '  <script src="config.js"></script>';

// config.js holds the deployed API URL and is owned by the Android build,
// never by public/. Everything else in www/ is a copy.
const PRESERVE = new Set(['config.js']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (!PRESERVE.has(entry.name)) {
      fs.copyFileSync(from, to);
    }
  }
}

function injectConfigTag(htmlPath) {
  if (!fs.existsSync(htmlPath)) return false;
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (html.includes('src="config.js"')) return false;

  // Put it first inside <head> so window.API_BASE_URL exists before any
  // other script reads it.
  const headOpen = html.indexOf('<head>');
  if (headOpen === -1) {
    throw new Error(`No <head> element in ${htmlPath}; cannot inject config.js`);
  }
  const insertAt = headOpen + '<head>'.length;
  html = html.slice(0, insertAt) + '\n' + CONFIG_TAG + html.slice(insertAt);
  fs.writeFileSync(htmlPath, html, 'utf8');
  return true;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('public/ not found. Run this from the project root.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(DEST, 'config.js'))) {
    console.error('android-app/www/config.js is missing. It holds the deployed API URL and must not be regenerated blindly.');
    process.exit(1);
  }

  copyDir(SRC, DEST);

  let injected = 0;
  for (const page of ['index.html', 'admin.html']) {
    if (injectConfigTag(path.join(DEST, page))) injected++;
  }

  const apiBase = fs.readFileSync(path.join(DEST, 'config.js'), 'utf8')
    .match(/window\.API_BASE_URL\s*=\s*['"]([^'"]+)['"]/);

  console.log('Synced public/ into android-app/www/');
  console.log(`  config.js tag injected into ${injected} page(s)`);
  console.log(`  app will call: ${apiBase ? apiBase[1] : '(API_BASE_URL not set!)'}`);
  if (!apiBase) process.exitCode = 1;
}

main();
