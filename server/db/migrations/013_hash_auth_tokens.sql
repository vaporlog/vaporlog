-- 013 — store only SHA-256 hashes of bearer tokens (auth_tokens.token_hash).
-- A DB dump must not hand out live sessions. Existing tokens are NOT
-- migrated (they were never hashed): every active session is invalidated and
-- users sign in again. Idempotent: the rename only runs when the old column
-- is still there.

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_name = 'auth_tokens'
       and column_name = 'token'
  ) then
    alter table auth_tokens rename column token to token_hash;
  end if;
end $$;
