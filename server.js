/**
 * The Reply Ladder
 *
 *   POST /api/create-order        creates an order, returns order_id + public key
 *   POST /api/verify-payment      verifies the signature, then delivers the PDF
 *   POST /api/razorpay-webhook    records the sale if the buyer closes the tab
 *
 * Run locally:  npm install  &&  npm start   ->  http://localhost:3000
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");

const {
  createOrder,
  verifySignature,
  fetchPayment,
  verifyWebhook,
  statusFor,
} = require("./lib/razorpay");



const app = express();
const PORT = process.env.PORT || 3000;

/* Mount point. Empty serves at "/", "/reply" serves at sortxai.com/reply.
   Set BASE_PATH in the environment, no trailing slash. */
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const at = (route) => BASE + route;

/* The webhook needs the raw body to check its signature, so it is mounted
   before the JSON parser and given its own raw parser. */
app.post(
  at("/api/razorpay-webhook"),
  express.raw({ type: "application/json" }),
  handleWebhook
);

app.use(express.json());
app.use(BASE || "/", express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------------ */
/* Sale log                                                            */
/* ------------------------------------------------------------------ */

/**
 * Delivery is manual. The buyer is told to WhatsApp +91 96327 12005 with
 * their email and proof of payment, and the pack is sent by hand.
 *
 * This still records every sale loudly, with the email and phone Razorpay
 * captured at checkout, so a buyer who pays and never messages can still be
 * chased rather than silently lost.
 */

const SALES_LOG = path.join(__dirname, "sales.log");
const seen = new Set();

async function recordSale({ paymentId, orderId }) {
  if (seen.has(paymentId)) return;
  seen.add(paymentId);

  let buyer = {};
  try {
    buyer = await fetchPayment(paymentId);
  } catch (error) {
    console.error("Could not fetch payment details:", error && (error.message || error));
  }

  const row = {
    at: new Date().toISOString(),
    paymentId,
    orderId,
    email: buyer.email || "",
    phone: buyer.phone || "",
    amount: buyer.amount || "",
    sent: false,
  };

  console.log("");
  console.log("  NEW SALE. Send the pack by hand.");
  console.log("  payment  " + paymentId);
  console.log("  order    " + orderId);
  console.log("  email    " + (row.email || "not captured"));
  console.log("  phone    " + (row.phone || "not captured"));
  console.log("  make it: npm run pack -- --name \"Their Name\" --phone \"" +
    (row.phone || "+91...") + "\" --order " + orderId);
  console.log("");

  try {
    fs.appendFileSync(SALES_LOG, JSON.stringify(row) + "\n");
  } catch (error) {
    console.error("Could not write sales.log:", error && (error.message || error));
  }
}

/* ------------------------------------------------------------------ */
/* 1. Create order                                                     */
/* ------------------------------------------------------------------ */

app.post(at("/api/create-order"), async (req, res) => {
  try {
    res.json(await createOrder());
  } catch (error) {
    const status = statusFor(error);
    console.error("create-order failed:", error && (error.message || error));

    res.status(status).json({
      error:
        status === 401
          ? "Payment gateway authentication failed. Check your Razorpay keys."
          : "Could not start the payment. Please try again.",
    });
  }
});

/* ------------------------------------------------------------------ */
/* 2. Verify payment, then deliver                                     */
/* ------------------------------------------------------------------ */

app.post(at("/api/verify-payment"), async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      verified: false,
      error: "Missing order id, payment id or signature.",
    });
  }

  let ok;
  try {
    ok = verifySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
  } catch (error) {
    console.error("verify-payment failed:", error && (error.message || error));
    return res
      .status(500)
      .json({ verified: false, error: "Verification failed. Please contact support." });
  }

  if (!ok) {
    // Signature did not match. Do NOT treat this as paid, do NOT deliver.
    console.warn("Signature mismatch for order", razorpay_order_id);
    return res
      .status(400)
      .json({ verified: false, error: "Payment could not be verified." });
  }

  console.log("Payment verified:", razorpay_payment_id, "order", razorpay_order_id);

  /* Payment is good. Log it so the pack can be sent by hand. Never let a
     logging problem change what the buyer is told: they paid, and they did. */
  try {
    await recordSale({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (error) {
    console.error("Could not record sale:", error && (error.message || error));
  }

  return res.json({
    verified: true,
    payment_id: razorpay_payment_id,
    order_id: razorpay_order_id,
  });
});

/* ------------------------------------------------------------------ */
/* 3. Webhook backstop                                                 */
/* ------------------------------------------------------------------ */

/**
 * If a buyer pays and closes the tab before the browser calls verify-payment,
 * the sale would never be logged and you would not know to chase them.
 * Razorpay still fires this webhook, so the sale is recorded either way.
 */
async function handleWebhook(req, res) {
  const signature = req.get("x-razorpay-signature");

  if (!verifyWebhook(req.body, signature)) {
    console.warn("Webhook signature invalid, ignoring");
    return res.status(400).json({ ok: false });
  }

  // Acknowledge immediately. Razorpay retries anything slow or failed.
  res.json({ ok: true });

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return;
  }

  if (event.event !== "payment.captured") return;

  const payment = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!payment) return;

  try {
    await recordSale({ paymentId: payment.id, orderId: payment.order_id });
  } catch (error) {
    console.error("Webhook could not record sale:", error && (error.message || error));
  }
}

/* ------------------------------------------------------------------ */

app.get(at("/healthz"), (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`The Reply Ladder running on http://localhost:${PORT}${BASE || ""}`);
  console.log("Delivery is manual. Buyers are told to WhatsApp +91 96327 12005.");
  console.log("Every sale is printed here and appended to sales.log.");
});
