import LegalLayout, { ContactBlock, L, SupportEmail } from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout
      path="/privacy"
      title="Privacy Policy"
      description="What information Cove collects from sellers and customers, how it is used, and the choices you have."
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          Cove is operated by <L k="businessName" /> (&ldquo;Cove&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy
          explains what information we collect when you run a store on Cove (a &ldquo;seller&rdquo;) or shop from a
          store hosted on Cove (a &ldquo;customer&rdquo;), and how we use it.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <h3>From sellers</h3>
        <ul>
          <li>Account details: your name, email address and password. Passwords are stored only as a secure hash.</li>
          <li>Business details: business name, category, and optionally phone number and city.</li>
          <li>
            Store content: products, photos, prices, stock, store settings, and the payment details you choose to show
            customers, such as a UPI QR code, payment link or instructions.
          </li>
          <li>
            Subscription details: your plan, trial and subscription status, and the reference numbers Razorpay gives us.
            Your card, UPI or bank details are entered with Razorpay and are not stored by Cove.
          </li>
        </ul>
        <h3>From customers</h3>
        <ul>
          <li>
            Order details you enter at checkout: your name, phone number, email address, delivery address if you
            choose delivery, order notes, the items you order, and any payment reference you submit.
          </li>
          <li>
            Product requests: the name, contact details and request you enter when you ask a store for a product.
          </li>
          <li>
            Store usage: storefronts count visits, product views and add-to-cart actions using a random ID saved in
            your browser. This ID is not linked to your name, email or phone number. No ID is created and nothing is
            counted if your browser sends a Do Not Track or Global Privacy Control signal.
          </li>
          <li>
            Request board votes: to count one vote per person, we store a one-way hash made from your IP address and
            browser. Your IP address itself is not stored with the vote.
          </li>
        </ul>
        <h3>From everyone</h3>
        <ul>
          <li>
            Technical information our servers receive with each request, such as your IP address and browser type,
            which we use to keep Cove secure and to limit abuse.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Cookies and browser storage</h2>
        <p>
          Cove uses one essential cookie to keep sellers signed in. We do not use advertising cookies. Your browser&apos;s
          local storage is used to remember your cart, the random store-usage ID described above, the requests you have
          voted for, and a few dashboard preferences. Session storage is used to show your order confirmation after
          checkout.
        </p>
        <p>
          Cove pages load fonts from Google Fonts, so Google receives your IP address and browser details when a page
          loads.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <ul>
          <li>to provide Cove, run storefronts, and show sellers the orders, customers and requests for their store;</li>
          <li>
            to send service emails, such as password resets, order and payment notifications, order confirmations to
            customers, and weekly store reports;
          </li>
          <li>to manage trials, subscriptions and billing;</li>
          <li>to show sellers analytics about their own store;</li>
          <li>to keep Cove secure, prevent fraud and abuse, and fix problems;</li>
          <li>to respond when you contact us.</li>
        </ul>
        <p>We do not sell personal information, and we do not use it for advertising.</p>
      </section>

      <section>
        <h2>5. Customer information and sellers</h2>
        <p>
          When you order from or send a request to a store, your details are shared with that store&apos;s seller so they
          can fulfil your order and contact you. Each seller decides how they use and keep their customers&apos;
          information, and Cove stores and processes it on the seller&apos;s behalf. For questions about an order, or to
          ask a seller to update or delete your details, please contact the seller directly. You can also contact us.
        </p>
      </section>

      <section>
        <h2>6. Service providers</h2>
        <p>We use trusted providers to run Cove. They receive only the information they need to do their job:</p>
        <ul>
          <li>MongoDB Atlas: database hosting</li>
          <li>Render and Vercel: application and website hosting</li>
          <li>Cloudinary: image storage and delivery</li>
          <li>Razorpay: subscription payments from sellers to Cove</li>
          <li>Resend: sending emails</li>
          <li>Google Fonts: web fonts</li>
        </ul>
        <p>
          Some of these providers may process information outside India. We may also share information if the law
          requires it, or to protect the rights and safety of our users or Cove.
        </p>
      </section>

      <section>
        <h2>7. How long we keep information</h2>
        <p>
          We keep seller account and store information while the account is open, including while a store is paused. If
          you ask us to close your account, we will delete or anonymise your information, except records we need to keep
          to meet legal, tax or accounting requirements or to resolve disputes.
        </p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>
          We use encrypted connections, hashed passwords and access controls that keep each seller&apos;s data separate.
          No online service can be completely secure, so please use a strong password and keep it private.
        </p>
      </section>

      <section>
        <h2>9. Your choices</h2>
        <ul>
          <li>Sellers can view and update their account and business details in Settings at any time.</li>
          <li>Sellers can turn individual email notifications on or off in Settings.</li>
          <li>
            You can ask us for a copy of your information, or ask us to correct or delete it, by emailing{' '}
            <SupportEmail />.
          </li>
          <li>You can stop store-usage counting by turning on Do Not Track or Global Privacy Control in your browser.</li>
        </ul>
      </section>

      <section>
        <h2>10. Children</h2>
        <p>Cove is not intended for children, and sellers must be able to enter into a binding contract.</p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. If a change is significant, we will let sellers know by email or
          in Cove. The effective date at the top of this page shows when the policy last changed.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>Questions or requests about your information can be sent to:</p>
        <ContactBlock />
      </section>
    </LegalLayout>
  );
}
