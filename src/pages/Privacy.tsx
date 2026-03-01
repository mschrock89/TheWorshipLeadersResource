import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="February 28, 2026">
      <section className="space-y-3">
        <p>
          Worship Leader&apos;s Resource authenticates users with Google and uses Google Calendar to push calendar dates.
          We only use Google data as needed to sync your calendar activity.
        </p>
      </section>

      <section className="space-y-3">
        <p>
          We do not sell your data. Data is stored using our normal app backend/service, including Supabase, and is
          used to provide the core functionality of the app.
        </p>
      </section>

      <section className="space-y-3">
        <p>
          If you have questions or want your account or data removed, contact{" "}
          <a className="text-primary underline" href="mailto:mitch.schrock@gmail.com">
            mitch.schrock@gmail.com
          </a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
