import { Link } from 'react-router-dom';
import LegalLayout, { ContactBlock, L, SupportEmail } from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout
      path="/terms"
      title="Terms of Service"
      description="The terms that apply when you create a Cove store or use a storefront hosted on Cove."
    >
      <section>
        <h2>1. About these terms</h2>
        <p>
          These Terms of Service are an agreement between you and <L k="businessName" /> (&ldquo;Cove&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). They apply when you create a Cove account to run an online store
          (a &ldquo;seller&rdquo;) and when you browse or order from a storefront hosted on Cove (a
          &ldquo;customer&rdquo;). By creating an account or using Cove, you agree to these terms. If you do not
          agree, please do not use Cove.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>You must be able to enter into a binding contract to create a seller account.</li>
          <li>Give accurate information when you sign up and keep it up to date.</li>
          <li>
            Keep your password private. You are responsible for activity on your account. Tell us at <SupportEmail /> if
            you think someone else has accessed it.
          </li>
          <li>One person or business may manage each account. Do not share or resell access to it.</li>
        </ul>
      </section>

      <section>
        <h2>3. Your store and your content</h2>
        <p>
          You keep ownership of everything you add to Cove, including product details, photos, prices, your logo and
          your payment instructions. You give us permission to store, copy, resize and display that content only as
          needed to run your store and provide Cove to you.
        </p>
        <p>
          You are responsible for your products and your store, including accurate descriptions and prices, having
          the right to sell what you list, meeting any laws, licences and tax obligations that apply to your business,
          and fulfilling the orders you accept.
        </p>
      </section>

      <section>
        <h2>4. Orders and customer payments</h2>
        <p>
          Cove gives sellers tools to take and manage orders. When a customer orders from a store, the sale is between
          the customer and that seller. Cove is not a party to that sale.
        </p>
        <p>
          Cove does not collect or process payments from customers to sellers. Customers pay sellers directly using the
          method the seller offers, such as a UPI QR code, a payment link, payment instructions or payment on pickup.
          Sellers are responsible for confirming payments, delivering orders, and handling returns, refunds and
          complaints from their customers. Customers should contact the seller about any order.
        </p>
      </section>

      <section>
        <h2>5. Plans, free trial and billing</h2>
        <ul>
          <li>
            New stores start with a 7-day free trial that includes all Cove Plus features. No card is needed to start
            the trial, and nothing is charged when it ends unless you choose a plan.
          </li>
          <li>
            Cove Basic costs ₹599 per month and Cove Plus costs ₹899 per month. <L k="taxNote" />
          </li>
          <li>
            Paid plans are billed monthly in advance through our payment partner, Razorpay, and renew automatically
            each month until you cancel.
          </li>
          <li>
            If your trial ends or your subscription stops and you do not have an active plan, your storefront is paused
            and it cannot take new orders. Your account and data are kept, and you can choose a plan again at any time.
          </li>
          <li>
            Cancellations, plan changes and refunds are covered by our{' '}
            <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
          </li>
          <li>
            If we change our prices, we will tell you in advance, and the new price will apply from your next billing
            period after the notice.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You agree not to use Cove to:</p>
        <ul>
          <li>sell goods or services that are illegal, or that you are not allowed to sell;</li>
          <li>publish content that is false, misleading, infringes someone else&apos;s rights, or is abusive;</li>
          <li>send spam or collect other people&apos;s information without permission;</li>
          <li>try to access accounts or data that are not yours, or disrupt or overload the service;</li>
          <li>copy, scrape or resell the Cove service, except as the law allows.</li>
        </ul>
      </section>

      <section>
        <h2>7. Suspension and closing your account</h2>
        <p>
          We may suspend or close an account that breaks these terms, puts customers or other sellers at risk, or is
          required to be suspended by law. Where it is reasonable, we will tell you why and give you a chance to fix the
          problem first.
        </p>
        <p>
          You can stop using Cove at any time. To close your account, cancel any active subscription from the Billing
          page and email us at <SupportEmail />.
        </p>
      </section>

      <section>
        <h2>8. Availability and changes to Cove</h2>
        <p>
          We work to keep Cove reliable, but we cannot promise it will always be available or free of errors. We may
          add, change or remove features over time. If we remove something that a paid plan relies on, we will give you
          reasonable notice.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers and liability</h2>
        <p>
          To the extent permitted by law, Cove is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, and we are
          not responsible for the products sellers list, the sales between sellers and customers, or payments made
          between them. To the extent permitted by law, we are not liable for indirect or consequential losses, such as
          lost profits or lost business. Nothing in these terms limits any rights you have that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>10. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. If a change is significant, we will let sellers know by email or
          in Cove before it takes effect. The effective date at the top of this page shows when the terms last changed.
        </p>
      </section>

      <section>
        <h2>11. Governing law</h2>
        <p>These terms are governed by <L k="jurisdiction" />.</p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>Questions about these terms can be sent to:</p>
        <ContactBlock />
      </section>
    </LegalLayout>
  );
}
