# Stripe (supporters and donations)

Seatbit is free, with every feature, for every clan. If you host an instance for others, you can let clans **support** it with a voluntary yearly (or monthly) payment, and let anyone give a **one-off donation**, through [Stripe](https://stripe.com). Supporters and donors get a small badge and a thank-you; nothing else changes. There are no plans, limits or locked features. You can turn on either one or both.

This is **off by default**. Until you turn it on, nobody sees anything about payments: no card in the clan settings, no badge, no payments section in the terms or privacy policy. Most self-hosters never need it.

What people see is described in [Supporter badge](../features/supporters.md) and [Donations](../features/donations.md).

![A Supporter clan](../screenshots/desktop-clan-settings.png){ .shot }

## Set it up

1. **Create a Stripe account** and switch to *Test mode* while you try it out.
2. **Turn on payment methods** under *Settings → Payments → Payment methods*: cards, TWINT, Apple Pay and Google Pay. TWINT needs prices in CHF. Checkout shows the methods that are on and fit the price.
3. **Create a product**, e.g. *Seatbit Supporter*, with a **recurring price per year** (e.g. CHF 30) and, if you like, a second **recurring price per month** (e.g. CHF 3). Copy the price IDs (`price_…`).
4. **Set up the customer portal** under *Settings → Billing → Customer portal*: allow customers to cancel and update their payment method, and save it once.
5. **Add a webhook endpoint** under *Developers → Webhooks* with the URL shown in Seatbit (`https://seatbit.example.com/api/billing/stripe/webhook`) and these events:
    - `checkout.session.completed`
    - `invoice.paid`
    - `customer.subscription.deleted`
    - `checkout.session.async_payment_succeeded` (donations paid with a delayed method)
    - `charge.refunded` (marks refunded donations)

    Copy its **signing secret** (`whsec_…`).
6. In Seatbit, open **Admin → Platform settings → Supporters**, enter the secret key, the webhook signing secret and the price IDs, and turn on **Supporter payments** and/or **One-off donations**. Or set the environment variables below.

Donations need only the secret key and the webhook: no product or price, because the amount is chosen on the donate page and sent to Checkout with it. Skip steps 3 and 4 if you only want donations.

![Supporter settings](../screenshots/desktop-admin-billing.png){ .shot }

| Setting | Variable | |
| --- | --- | --- |
| Supporter payments | `BILLING_ENABLED` | `false` by default. |
| Stripe secret key | `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…`, or a restricted key (`rk_…`) with write access to Checkout Sessions, Customer portal and Subscriptions, and read access to Prices. |
| Webhook signing secret | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| Annual price ID | `STRIPE_PRICE_ANNUAL` | Required. |
| Monthly price ID | `STRIPE_PRICE_MONTHLY` | Optional. |
| Refund policy | `BILLING_REFUND_POLICY` | Sentence shown in the terms. |
| One-off donations | `DONATIONS_ENABLED` | `false` by default. |
| Suggested amounts | `DONATION_AMOUNTS` | Whole amounts, comma-separated, e.g. `10, 20, 50`. People can type their own (1 to 10,000). |
| Donation currency | `DONATION_CURRENCY` | `CHF` by default. TWINT needs CHF. |

The card only shows up when the switch is on and the secret key and annual price are set. The settings page lists what's missing, and which clans are Supporters right now.

### Try it in test mode

Pay with a [Stripe test card](https://docs.stripe.com/testing) such as `4242 4242 4242 4242`. To get webhooks on your own machine, use the Stripe CLI and put the secret it prints into the settings:

```sh
stripe listen --forward-to localhost:3000/api/billing/stripe/webhook
```

When it works, switch Stripe to live mode, create the product, prices and webhook there as well, and replace the test values.

## How it works

- The **webhook** checks Stripe's signature (and refuses deliveries older than five minutes), and handles each event once, however often Stripe sends it.
- `checkout.session.completed` links the clan to its Stripe customer and subscription, `invoice.paid` extends **Supporter until** to the end of the paid period (also for every renewal), and `customer.subscription.deleted` ends it.
- Seatbit stores only the Stripe customer and subscription IDs, the plan and the paid-until date on the clan. Card and TWINT details stay with Stripe.
- The audit log of the clan notes when it became a Supporter and when the subscription ended.
- **Donations** use Checkout in payment mode. Only paid ones are stored (on `checkout.session.completed`, or `checkout.session.async_payment_succeeded` for delayed methods); the thank-you page also asks Stripe directly, so the badge shows even before the webhook arrives. Seatbit stores the donor, the clan (if any), amount, currency, the Checkout and PaymentIntent IDs and the badge choice. A full refund (`charge.refunded`) marks it refunded.
- A donation for a clan of at least the annual price (same currency) extends the clan's **Supporter until** by a year. Refunding it doesn't shorten that again; change it in the database if you need to.
- Each payment also raises an in-app event (`donation.received`, `donation.refunded`, `supporter.started`, `supporter.renewed`, `supporter.ended`, see `src/lib/platform-events.ts`) that ops notifications can listen to. It carries clan names and amounts, never emails.

## Legal texts

With payments or donations on, the built-in [Terms of Service](legal.md) get a *Supporter payments* (and/or *Donations*) section (voluntary, no extra features, cancel any time, your refund policy) and the Privacy Policy names Stripe as payment provider. If you use your own documents, add the same there. Seatbit doesn't issue invoices with VAT; Stripe sends receipts.
