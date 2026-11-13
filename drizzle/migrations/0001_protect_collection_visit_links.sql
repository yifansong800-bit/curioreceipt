REVOKE INSERT, UPDATE ON public.collection_entries FROM authenticated;
GRANT INSERT (user_id, category, status, ink, snapshot) ON public.collection_entries TO authenticated;
GRANT UPDATE (category, status, ink, snapshot, updated_at) ON public.collection_entries TO authenticated;
COMMENT ON COLUMN public.collection_entries.guest_visit_id IS 'Server-managed link: set only after authenticated account and guest session ownership checks.';