import LegalLayout, { ContactBlock, L, SupportEmail } from './LegalLayout';

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
          This policy covers Cove subscriptions that sellers pay to <L k="businessName" /> for using Cove.
        </p>
        <p>
          <strong>Buying from a shop on Cove?</strong> Each shop sets its own return and refund policy. Cove does not
          receive or hold payments made to shops, so we cannot issue refunds for them. Please contact the shop you ordered
          from.
        </p>
      </section>

      <section>
        <h2>2. Free trial</h2>
        <p>
          Every new store starts with a 7-day free trial that includes all Cove Plus features. No card is needed to start
          the trial, and nothing is charged when it ends unless you choose a plan.
        </p>
      </section>

      <section>
        <h2>3. Billing</h2>
        <p>
          Cove Basic costs ₹599 per month and Cove Plus costs ₹899 per month. <L k="taxNote" /> Plans are billed monthly
          in advance through Razorpay and renew automatically until you cancel.
        </p>
      </section>

      <section>
        <h2>4. Cancelling your subscription</h2>
        <ul>
          <li>You can cancel at any time from the Billing page in your Cove dashboard.</li>
          <li>
            Cancelling stops the next renewal. You keep your plan until the end of the billing period you have already
            paid for, and you will not be charged again.
          </li>
          <li>
            If you choose a plan during your free trial and cancel before the first payment, nothing is charged and your
            trial continues.
          </li>
          <li>
            When your plan ends, your storefront is paused and stops taking new orders. Your account, products, orders
            and customers are kept, and you can choose a plan again at any time.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Changing plans</h2>
        <p>
          Upgrading from Cove Basic to Cove Plus takes effect straight away. Moving from Cove Plus to Cove Basic takes
          effect at the end of your current billing period.
        </p>
      </section>

      <section>
        <h2>6. Refunds</h2>
        <p>
          Because you keep your plan until the end of the period you paid for, cancelling does not give a refund for the
          rest of that period.
        </p>
        <p>
          If you were charged by mistake, for example charged twice or charged after you cancelled, email us at{' '}
          <SupportEmail /> within <L k="refundRequestDays" /> days of the charge with your account email and the payment
          details. If we confirm the charge was a mistake, we will refund it to the original payment method through
          Razorpay. Refunds usually reach your account within <L k="refundProcessingTime" />, depending on your bank.
        </p>
        <p>This policy does not affect any rights you have under applicable law.</p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>For billing questions or refund requests, contact:</p>
        <ContactBlock />
      </section>
    </LegalLayout>
  );
}
