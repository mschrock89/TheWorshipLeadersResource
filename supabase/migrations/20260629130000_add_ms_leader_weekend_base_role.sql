-- MS Leader Weekend is a separate base role from the standard MS Leader, used for
-- leaders serving the weekend (eon_weekend) middle school ministry.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ms_leader_weekend';
