-- Network Student Pastor is the network-wide counterpart to Student Pastor:
-- it oversees student ministry (HS + MS) across every campus, mirroring the way
-- Network Worship Pastor relates to Campus Worship Pastor.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'network_student_pastor';
