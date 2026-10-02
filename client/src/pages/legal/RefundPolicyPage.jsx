import LegalLayout, { ContactBlock, SupportEmail } from './LegalLayout';

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      path="/refund-policy"
      title="Refund & Cancellation Policy"
      description="How Cove subscriptions, free trials, cancellations and refunds work."
    >
      <section>
        <h2>1. What this policy covers</h2>
        <p>
          This policy covers the Cove subscriptions that sellers pay for to use Cove.
        </p>
        <p>
          <strong>Bought something from a Cove storefront?</strong> Returns, cancellations and refunds for products or
          services purchased from a Cove storefront are handled by the seller. Customers should contact the seller using
          the contact details displayed on the storefront. Cove does not receive or hold payments made to sellers, and
          Cove does not automatically determine or guarantee a seller&apos;s refund decision.
        </p>
      </section>

      <section>
        <h2>2. Free trial</h2>
        <p>
          Every new store starts with a 7-day free trial that includes all Cove Plus features. No card is needed to start
          the trial, and nothing is charged when it ends unless you choose a plan. After the trial, you must choose a
          paid plan to keep your store open.
        </p>
      </section>

      <section>
        <h2>3. Billing</h2>
        <p>
          Cove Basic costs ₹599 per month and Cove Plus costs ₹899 per month. Subscription billing is processed through Razorpay. Plans are billed monthly and renew automatically until you
          cancel.
        </p>
      </section>

      <section>
        <h2>4. Cancelling your subscription</h2>
        <ul>
          <li>You can cancel at any time from the Billing page in your Cove dashboard.</li>
          <li>
            Cancelling stops the next renewal. Your plan stays active until the end of the subscription period you have
            already paid for, and you will not be charged again.
          </li>
          <li>Cancelling does not delete your store data.</li>
          <li>
            If you choose a plan during your free trial and cancel before the first payment, nothing is charged and your
            trial continues.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Failed payments and paused stores</h2>
        <ul>
          <li>Razorpay may retry a failed recurring payment.</li>
          <li>Cove may keep your store open for up to 7 days after the first failed payment.</li>
          <li>After that grace period, your store may be paused until billing is resolved.</li>
          <li>
            When your plan ends or your store is paused, your storefront stops taking new orders. Your store data,
            including products, orders and customers, is kept, and you can reopen your store by resolving billing or
            choosing an active paid plan.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Changing plans</h2>
        <p>
          An upgrade from Cove Basic to Cove Plus takes effect according to the applicable Razorpay subscription and
          billing flow. Moving from Cove Plus to Cove Basic takes effect at the end of your current billing period.
        </p>
      </section>

      <section>
        <h2>7. Refunds</h2>
        <p>
          Because your plan stays active until the end of the period you paid for, cancelling does not give a refund for
          the rest of that period.
        </p>
        <p>
          If you think you were charged by mistake, for example charged twice or charged after you cancelled, email us
          at <SupportEmail /> with your account email and the payment details. We will look into it and, if the charge
          was made in error, arrange a refund to the original payment method through Razorpay. How long a refund takes
          to reach you depends on Razorpay and your bank.
        </p>
        <p>This policy does not affect any rights you have under applicable law.</p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>For billing questions or refund requests, contact:</p>
        <ContactBlock />
      </section>
    </LegalLayout>
  );
}
