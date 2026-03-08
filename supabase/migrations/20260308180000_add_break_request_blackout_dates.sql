ALTER TABLE public.break_requests
ADD COLUMN request_scope text NOT NULL DEFAULT 'full_trimester',
ADD COLUMN blackout_dates date[];

ALTER TABLE public.break_requests
ADD CONSTRAINT break_requests_request_scope_check
CHECK (request_scope IN ('full_trimester', 'blackout_dates'));

COMMENT ON COLUMN public.break_requests.request_scope IS 'Whether the request covers the full trimester or selected blackout weekends.';
COMMENT ON COLUMN public.break_requests.blackout_dates IS 'Optional list of weekend dates the volunteer cannot serve within the selected rotation period.';
