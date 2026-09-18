/**
 * Shared Razorpay helpers.
 *
 * Used by both the Express server (server.js) and the Vercel serverless
 * functions in /api. The key secret is read from the environment and never
 * leaves this process.
 */

const crypto = require("crypto");
const Razorpay = require("razorpay");

const MIN_AMOUNT_PAISE = 100;

function getConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!keyId || !keySecret) {
    const err = new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in the environment"
    );
    err.statusCode = 500;
    throw err;
  }

  return {
    keyId,
    keySecret,
    amount: Number(process.env.PRODUCT_AMOUNT_PAISE || 99900),
    currency: process.env.PRODUCT_CURRENCY || "INR",
  };
}

function getClient() {
  const { keyId, keySecret } = getConfig();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Create a Razorpay order.
 *
 * The amount is taken from the server environment, never from the request
 * body, so a visitor cannot edit the price in their browser and pay 1 rupee.
 */
async function createOrder() {
  const { keyId, amount, currency } = getConfig();

  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_PAISE) {
    const err = new Error(
      `Amount must be a whole number of paise, at least ${MIN_AMOUNT_PAISE}`
    );
    err.statusCode = 400;
    throw err;
  }

  const receipt = `rl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const order = await getClient().orders.create({
    amount,
    currency,
    receipt,
    notes: { product: "The Reply Ladder" },
  });

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: keyId, // public key, safe to send to the browser
  };
}

/**
 * Verify the signature Razorpay returns after a successful payment.
 *
 * signature = HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
 *
 * Compared in constant time so the check cannot be probed byte by byte.
 */
function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const { keySecret } = getConfig();

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(razorpay_signature), "utf8");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Fetch a payment from Razorpay so we know who to send the pack to.
 *
 * Standard Checkout collects the buyer's email and phone in the modal, so
 * they come back on the payment object. We never trust the browser for this.
 */
async function fetchPayment(paymentId) {
  const payment = await getClient().payments.fetch(paymentId);

  return {
    email: payment.email || "",
    phone: payment.contact || "",
    name: (payment.notes && payment.notes.name) || "",
    amount: payment.amount,
    status: payment.status,
  };
}

/**
 * Verify a Razorpay webhook.
 *
 * signature = HMAC_SHA256(raw request body, WEBHOOK_SECRET)
 * The raw body matters. Re-serialising parsed JSON will not match.
 */
function verifyWebhook(rawBody, signature) {
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Map a Razorpay SDK error onto an HTTP status code. */
function statusFor(error) {
  if (error && error.statusCode) return error.statusCode;
  const code = error && error.error && error.error.code;
  if (code === "BAD_REQUEST_ERROR") return 400;
  if (error && (error.status === 401 || code === "UNAUTHORIZED")) return 401;
  return 500;
}

module.exports = {
  MIN_AMOUNT_PAISE,
  getConfig,
  createOrder,
  verifySignature,
  fetchPayment,
  verifyWebhook,
  statusFor,
};
