import { Link } from 'react-router-dom';
import LegalLayout, { ContactBlock, SupportEmail } from './LegalLayout';

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
          Cove (&ldquo;Cove&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides software and storefront tools that
          help independent sellers create and operate online stores.
        </p>
        <p>
          These terms apply when you create a Cove account to run a store (a &ldquo;seller&rdquo;) and when you browse
          or order from a storefront hosted on Cove (a &ldquo;customer&rdquo;). By creating an account or using Cove,
          you agree to these terms. If you do not agree, please do not use Cove.
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
          The business details you enter in Settings, including your business name, phone number, business email and
          city, may be displayed on your public storefront so customers can identify and contact your shop. Keep them
          accurate.
        </p>
      </section>

      <section>
        <h2>4. Who is responsible for what</h2>
        <p>
          Cove provides the software and storefront infrastructure. Cove does not itself sell the products or services
          listed on a seller&apos;s storefront, and does not guarantee a seller&apos;s fulfilment of an order or a
          seller&apos;s refund decision.
        </p>
        <p>Each seller is responsible for:</p>
        <ul>
          <li>their products and services, product descriptions, prices and availability;</li>
          <li>fulfilling orders, including delivery or pickup;</li>
          <li>customer service;</li>
          <li>returns, refunds and cancellations relating to their goods or services; and</li>
          <li>making sure their goods and services comply with applicable law, including any licences and taxes.</li>
        </ul>
        <p>
          Customers should send questions about an order to the seller first, using the contact details shown on the
          seller&apos;s storefront.
        </p>
      </section>

      <section>
        <h2>5. Customer payments</h2>
        <p>
          Customers pay sellers directly using the method the seller offers, such as a UPI QR code, a payment link,
          payment instructions or payment on pickup. Cove does not collect, hold or settle customer payments for
          sellers&apos; products or services. Sellers are responsible for confirming the payments they receive.
        </p>
        <p>
          Cove&apos;s Razorpay integration is used only for the subscriptions sellers pay to use Cove, described below.
        </p>
      </section>

      <section>
        <h2>6. Plans, free trial and billing</h2>
        <ul>
          <li>
            New stores start with a 7-day free trial that includes all Cove Plus features. No card is needed to start
            the trial, and nothing is charged when it ends unless you choose a plan.
          </li>
          <li>After the trial, you must choose a paid plan to keep your store open.</li>
          <li>
            Cove Basic costs ₹599 per month and Cove Plus costs ₹899 per month.
          </li>
          <li>
            Subscription billing is processed through our payment partner, Razorpay. Paid plans are billed monthly and
            renew automatically each month until you cancel.
          </li>
          <li>
            If you cancel, your plan stays active until the end of the subscription period you have already paid for.
            Cancelling does not delete your store data.
          </li>
          <li>
            If a recurring payment fails, Razorpay may retry it, and your store may stay open for up to 7 days after the
            first failed payment. After that grace period, your storefront may be paused until billing is resolved.
          </li>
          <li>
            When your store is paused, it cannot take new orders, but your store data is kept. You can reopen it by
            resolving billing or choosing an active paid plan.
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
        <h2>7. Acceptable use</h2>
        <p>You agree not to use Cove to:</p>
        <ul>
          <li>carry out any unlawful activity, or sell goods or services that you are not allowed to sell;</li>
          <li>infringe another person&apos;s intellectual property or other rights;</li>
          <li>upload content that you do not have the necessary rights to use;</li>
          <li>publish obscene or sexually explicit content where prohibited, or content that is harmful to children;</li>
          <li>publish content that is harassing, abusive, or promotes hatred or violence;</li>
          <li>impersonate another person or business;</li>
          <li>
            publish content that threatens national security or public order, where prohibited by law;
          </li>
          <li>upload malware or other malicious code;</li>
          <li>commit fraud or carry out deceptive activity, including false or misleading listings;</li>
          <li>send spam or collect other people&apos;s information without permission;</li>
          <li>
            try to compromise Cove or other users, including accessing accounts or data that are not yours, or
            disrupting or overloading the service;
          </li>
          <li>copy, scrape or resell the Cove service, except as the law allows.</li>
        </ul>
        <p>
          Sellers are responsible for ensuring that products and services offered through their storefront comply with
          applicable laws and regulations. Cove may restrict or remove categories of products or services that it
          determines are prohibited by law, payment-provider requirements, platform rules, or Cove&apos;s policies.
        </p>
      </section>

      <section>
        <h2>8. Suspension and closing your account</h2>
        <p>
          We may suspend or close an account that breaks these terms, puts customers or other sellers at risk, or is
          required to be suspended by law. Where it is reasonable, we will tell you why and give you a chance to fix the
          problem first.
        </p>
        <p>
          You can stop using Cove at any time. To close your account, cancel any active subscription from the Billing
          page and email us at <SupportEmail />. Deletion requests are handled as described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>9. Availability and changes to Cove</h2>
        <p>
          We work to keep Cove reliable, but we cannot promise it will always be available or free of errors. We may
          add, change or remove features over time. If we remove something that a paid plan relies on, we will give you
          reasonable notice.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers and liability</h2>
        <p>
          To the extent permitted by law, Cove is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, and we are
          not responsible for the products sellers list, the sales between sellers and customers, or payments made
          between them. To the extent permitted by law, we are not liable for indirect or consequential losses, such as
          lost profits or lost business. Nothing in these terms limits any rights you have that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>11. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. If a change is significant, we will let sellers know by email or
          in Cove before it takes effect. The effective date at the top of this page shows when the terms last changed.
        </p>
      </section>

      <section>
        <h2>12. Questions and complaints</h2>
        <p>
          Questions or complaints about an order, including returns and refunds, should go to the seller first, using
          the contact details shown on the seller&apos;s storefront.
        </p>
        <p>Questions or complaints about Cove itself, or about these terms, can be sent to:</p>
        <ContactBlock />
      </section>
    </LegalLayout>
  );
}
