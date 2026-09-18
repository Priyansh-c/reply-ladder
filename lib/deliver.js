/**
 * Delivery: stamp the PDF with the buyer's details, then email it.
 *
 * Runs after a payment has been verified. Two steps:
 *
 *   1. watermark()  puts "Licensed to NAME - PHONE" in the footer of every
 *                   page, plus the order id, so a leaked copy is traceable.
 *   2. sendPack()   emails the stamped PDF as an attachment.
 *
 * Nothing here talks to the browser. The buyer's copy is built server side
 * and the master PDF in assets/ is never modified.
 */

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const MASTER_PDF = path.join(__dirname, "..", "assets", "The-Reply-Ladder.pdf");

/* ------------------------------------------------------------------ */
/* Watermark                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {{name?: string, phone?: string, email?: string, orderId?: string}} buyer
 * @returns {Promise<Buffer>} the personalised PDF
 */
async function watermark(buyer) {
  if (!fs.existsSync(MASTER_PDF)) {
    throw new Error(`Master PDF not found at ${MASTER_PDF}`);
  }

  const pdf = await PDFDocument.load(fs.readFileSync(MASTER_PDF));
  const font = await pdf.embedFont(StandardFonts.Courier);

  const who = [buyer.name, buyer.phone || buyer.email]
    .filter(Boolean)
    .join("  ·  ");

  const line = who ? `Licensed to ${who}` : "Licensed copy";
  const ref = buyer.orderId ? `Ref ${buyer.orderId}` : "";

  pdf.getPages().forEach((page) => {
    const { width } = page.getSize();

    page.drawText(line, {
      x: 54,
      y: 26,
      size: 7,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });

    if (ref) {
      const w = font.widthOfTextAtSize(ref, 7);
      page.drawText(ref, {
        x: width - 54 - w,
        y: 26,
        size: 7,
        font,
        color: rgb(0.7, 0.7, 0.7),
      });
    }
  });

  pdf.setTitle("The Reply Ladder");
  pdf.setAuthor("SortXAi");
  pdf.setSubject(line);

  return Buffer.from(await pdf.save());
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const err = new Error(
      "SMTP_HOST, SMTP_USER and SMTP_PASS must be set to send the pack"
    );
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }

  const port = Number(SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 is implicit TLS, 587 upgrades with STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function bodyText(name) {
  const hi = name ? `Hey ${name.split(" ")[0]},` : "Hey,";
  return `${hi}

Your copy of The Reply Ladder is attached.

Your name and number are on every page. It is licensed to you, so please
don't pass it around.

Start with Module 01 and send 10 messages today. Don't read the whole thing
first, it'll just sit there. Ten messages today beats reading all 35 scripts
this weekend.

One thing before you go. Hit reply and tell me what you sell and who you're
going after. I read all of these, and if your first few messages aren't
landing I'll tell you what to change.

Priyansh
SortXAi
priyansh@sortxai.com`;
}

/**
 * Watermark and email the pack.
 *
 * @param {{name?: string, email: string, phone?: string, orderId?: string, paymentId?: string}} buyer
 */
async function sendPack(buyer) {
  if (!buyer || !buyer.email) {
    throw new Error("Cannot deliver without a buyer email address");
  }

  const pdf = await watermark(buyer);
  const transport = getTransport();

  const from =
    process.env.MAIL_FROM || `SortXAi <${process.env.SMTP_USER}>`;

  await transport.sendMail({
    from,
    to: buyer.email,
    replyTo: process.env.MAIL_REPLY_TO || "priyansh@sortxai.com",
    subject: "Your Reply Ladder is here",
    text: bodyText(buyer.name),
    attachments: [
      {
        filename: "The-Reply-Ladder.pdf",
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  return { bytes: pdf.length };
}

module.exports = { watermark, sendPack, MASTER_PDF };
