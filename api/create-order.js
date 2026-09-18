/**
 * Vercel serverless function: POST /api/create-order
 *
 * Identical behaviour to the Express route in server.js. Use whichever
 * deployment target you prefer. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 * and PRODUCT_AMOUNT_PAISE in the Vercel project's environment variables.
 */

const { createOrder, statusFor } = require("../lib/razorpay");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const order = await createOrder();
    return res.status(200).json(order);
  } catch (error) {
    const status = statusFor(error);
    console.error("create-order failed:", error && (error.message || error));

    return res.status(status).json({
      error:
        status === 401
          ? "Payment gateway authentication failed. Check your Razorpay keys."
          : "Could not start the payment. Please try again.",
    });
  }
};
