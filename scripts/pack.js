#!/usr/bin/env node
/**
 * Make one buyer's copy of the pack, ready to attach in WhatsApp or email.
 *
 *   npm run pack -- --name "Rahul Verma" --phone "+91 98765 43210" --order order_XXXX
 *
 * Writes to outbox/The-Reply-Ladder-rahul-verma.pdf
 *
 * Only --name is required. Phone and order are stamped when given, and the
 * order id is what lets you match a leaked copy back to a buyer later.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { watermark } = require("../lib/deliver");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "buyer";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name) {
    console.error("");
    console.error("  Usage:");
    console.error('    npm run pack -- --name "Rahul Verma" --phone "+91 98765 43210" --order order_XXXX');
    console.error("");
    console.error("  --name   required, goes in the footer of every page");
    console.error("  --phone  optional, stamped next to the name");
    console.error("  --order  optional, stamped bottom right so a leak is traceable");
    console.error("");
    process.exit(1);
  }

  const pdf = await watermark({
    name: args.name,
    phone: typeof args.phone === "string" ? args.phone : "",
    orderId: typeof args.order === "string" ? args.order : "",
  });

  const outDir = path.join(__dirname, "..", "outbox");
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `The-Reply-Ladder-${slug(args.name)}.pdf`);
  fs.writeFileSync(file, pdf);

  console.log("");
  console.log("  Copy ready for " + args.name);
  console.log("  " + file);
  console.log("  " + Math.round(pdf.length / 1024) + " KB");
  console.log("");
  console.log("  Attach it in WhatsApp, then note the sale as sent in sales.log.");
  console.log("");
}

main().catch((error) => {
  console.error("Could not build the copy:", error && (error.message || error));
  process.exit(1);
});
