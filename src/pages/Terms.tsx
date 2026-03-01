import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export default function Terms() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="February 28, 2026">
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Agreement</h2>
        <p>
          These Terms of Service govern your use of Worship Leader&apos;s Resource, a platform used by Experience Music
          at Experience Community Church. By accessing or using the service, you agree to these terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Use of the Service</h2>
        <p>
          The service is provided to help authorized users manage worship schedules, team communication, planning
          resources, setlists, and related ministry workflows.
        </p>
        <p>You agree to use the service only for lawful, authorized, and ministry-related purposes.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Accounts and Access</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>You are responsible for maintaining the confidentiality of your account and login credentials.</li>
          <li>You are responsible for activity that occurs under your account.</li>
          <li>Access may be limited, suspended, or removed if your role changes or if your use violates these terms.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Use the service to violate any law or another person&apos;s rights.</li>
          <li>Attempt to gain unauthorized access to accounts, systems, or data.</li>
          <li>Upload or transmit malicious code, spam, or disruptive content.</li>
          <li>Misuse church member information or export data for unauthorized purposes.</li>
          <li>Interfere with the reliability, security, or normal operation of the service.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Third-Party Services</h2>
        <p>
          Some features rely on third-party services, including Google Calendar and Planning Center. Your use of those
          integrations may also be subject to the third party&apos;s terms and privacy policies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Content and Data</h2>
        <p>
          You retain responsibility for the content you submit or manage through the service. You represent that you
          have the right to provide that content and that it does not violate applicable law or policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Disclaimers</h2>
        <p>
          The service is provided on an as-is and as-available basis. We do not guarantee uninterrupted availability,
          complete accuracy, or error-free operation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, Experience Community Church and its operators will not be liable for
          indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Termination</h2>
        <p>
          We may suspend or terminate access at any time if needed to protect the service, comply with legal
          requirements, or address misuse. You may stop using the service at any time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the service after changes become effective means
          you accept the revised terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Contact</h2>
        <p>
          Questions about these Terms can be sent to{" "}
          <a className="text-primary underline" href="mailto:worship@theworshipleadersresource.com">worship@theworshipleadersresource.com</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
