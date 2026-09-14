import { LegalPageLayout } from "@/components/legal/LegalPageLayout";

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="September 13, 2026">
      <section className="space-y-3">
        <p>
          Worship Resource authenticates users with email and password. If a leader connects Google, we use
          Google Calendar to push calendar dates. We only use Google Calendar data as needed to sync your
          calendar activity.
        </p>
      </section>

      <section className="space-y-3">
        <p>
          If a leader connects Gmail for the Audition Inbox, we request read access to identify emails about
          auditions, worship team interest, or serving, and send access so that leader can reply from the app.
          We store matching message metadata and content in our backend only to power that inbox. We do not use
          Gmail data to train AI models, and we do not sell it.
        </p>
      </section>

      <section className="space-y-3">
        <p>
          Profile photos and chat attachments stay in our app backend so your team can see them. Optional
          campus attendance check-in uses location only while that setting is turned on, and only to see if
          you are at your assigned campus. We do not use photos, email, messages, or location to track you
          across other companies&apos; apps or websites, and we do not share data with data brokers or
          advertising networks.
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
          You can delete your account in the app: sign in, open My Profile, then tap Delete Account. That
          permanently removes your login and personal data. If you have questions or need help, contact{" "}
          <a className="text-primary underline" href="mailto:mitch.schrock@gmail.com">
            mitch.schrock@gmail.com
          </a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
