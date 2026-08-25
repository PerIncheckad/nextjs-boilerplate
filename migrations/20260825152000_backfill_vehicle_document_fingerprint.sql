begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.vehicle_documents as document
set metadata = document.metadata || jsonb_build_object(
  'contentFingerprint', lower(replace(coalesce(object.metadata->>'eTag', ''), '"', '')),
  'fingerprintSource', 'SUPABASE_STORAGE_ETAG'
)
from storage.objects as object
where document.storage_bucket = object.bucket_id
  and document.storage_path = object.name
  and not (document.metadata ? 'contentFingerprint')
  and coalesce(replace(object.metadata->>'eTag', '"', ''), '') ~ '^[A-Fa-f0-9]{16,128}$';

commit;
