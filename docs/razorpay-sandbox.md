# Razorpay sandbox checkout

The signed-in Account page offers three one-interview purchases in Razorpay Test Mode.

| Duration | Sandbox price |
| --- | --- |
| 3 minutes | INR 9 |
| 15 minutes | INR 49 |
| 30 minutes | INR 89 |

Each account also gets one free 3-minute interview. The development-only 1-minute smoke-test allowance is separate.

Generate Test Mode credentials in Razorpay and save the key ID and secret as `RAZORPAY_TEST_KEY_ID` and `RAZORPAY_TEST_KEY_SECRET` in `.env.local`. The key ID starts with `rzp_test_`. Set `BETTER_AUTH_URL` to the browser origin you use, then restart the app.

To test an immediate capture, open Account and complete checkout with a [Razorpay test payment method](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps#2-test-integration). Enable automatic capture in the Razorpay dashboard to test an immediate payment confirmation.

To test deferred capture and retries, configure a Test Mode webhook for `payment.captured` at a publicly reachable HTTPS URL ending in `/api/v1/payments/webhook`. Store the matching signing secret in `RAZORPAY_TEST_WEBHOOK_SECRET`. Both confirmation paths verify the captured amount and order, then apply the order once to the purchased duration. The browser callback works locally even when a webhook cannot reach localhost.

Production pricing and live payment activation remain open.
