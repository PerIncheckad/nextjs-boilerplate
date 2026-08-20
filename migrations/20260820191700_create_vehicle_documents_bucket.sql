-- Private Storage bucket for Vagnkort documents.
-- File operations go through the Supabase Storage API; the bucket stays private
-- and document access is issued by authenticated server routes using signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vehicle-documents', 'vehicle-documents', false, 52428800)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit;
