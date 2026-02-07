# Supabase Migration Walkthrough

Your Supabase project has an empty schema. Follow these steps to apply all migrations via the SQL Editor.

---

## Step 1: Open Supabase SQL Editor

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (`cpqenpsibznmswkiahhv` or your project name)
3. In the left sidebar, click **SQL Editor**

---

## Step 2: Run the Combined Migration

### Option A: Run everything at once (recommended)

1. Open the file `supabase/combined_migrations.sql` in your project
2. Select all contents (Cmd+A) and copy (Cmd+C)
3. In Supabase SQL Editor, click **+ New query**
4. Paste the SQL (Cmd+V)
5. Click **Run** (or press Cmd+Enter)

The migration will take 30–60 seconds. If it completes without errors, you’re done.

---

### Option B: Run in batches (if Option A fails or times out)

If the full migration fails or times out, run it in chunks:

1. Open `supabase/combined_migrations.sql`
2. Copy the first ~2000 lines, paste into SQL Editor, and run
3. If that succeeds, copy the next ~2000 lines and run
4. Repeat until all content has been run

---

## Step 3: Verify

1. In Supabase, go to **Table Editor**
2. Confirm tables exist: `profiles`, `campuses`, `songs`, `draft_sets`, `draft_set_songs`, etc.
3. Open your app and confirm setlists, songs, and the calendar load correctly

---

## If You See Errors

- **"relation X does not exist"** – Run migrations in order. You may need to use Option B and run earlier batches first.
- **"already exists"** – Something was already created. You can often ignore these if the migration uses `IF NOT EXISTS` or `CREATE OR REPLACE`.
- **Permission/storage errors** – Some migrations create storage buckets or functions; if you lack permissions, ask your project/org owner to run them.

---

## What the migrations create

Roughly in order:

1. **Profiles & auth** – `profiles`, `user_roles`, `handle_new_user`, storage for avatars  
2. **Campuses** – `campuses`, `user_campuses`  
3. **Chat** – `chat_messages`, `message_reactions`  
4. **Songs & plans** – `songs`, `service_plans`, `plan_songs`  
5. **Setlists** – `draft_sets`, `draft_set_songs`  
6. **Other features** – teams, events, playlists, notifications, etc.  
7. **RPC** – `get_prior_song_uses` for the NEW badge logic
