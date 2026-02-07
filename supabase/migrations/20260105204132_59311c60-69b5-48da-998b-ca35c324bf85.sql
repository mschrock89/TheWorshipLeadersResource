-- Update existing records to use new roles
UPDATE public.user_roles SET role = 'admin' WHERE role = 'leader';
UPDATE public.user_roles SET role = 'campus_worship_pastor' WHERE role = 'campus_pastor';
UPDATE public.user_roles SET role = 'volunteer' WHERE role = 'member';

-- Update handle_new_user function to assign 'volunteer' as default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- First user becomes admin, others become volunteer
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first_user THEN 'admin'::app_role ELSE 'volunteer'::app_role END);
  
  RETURN NEW;
END;
$function$;

-- Update get_basic_profiles to check for admin role
CREATE OR REPLACE FUNCTION public.get_basic_profiles()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE 
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
    OR p.id = auth.uid()
$function$;

-- Update get_profile_safe to check for admin/campus_worship_pastor roles
CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text, email text, phone text, birthday date, anniversary date, positions team_position[], share_contact_with_campus boolean, share_contact_with_pastors boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = profile_id
    AND (
      p.id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR shares_campus_with(auth.uid(), p.id)
    )
$function$;

-- Update get_profiles_for_campus
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(id uuid, full_name text, avatar_url text, email text, phone text, birthday date, anniversary date, positions team_position[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$function$;