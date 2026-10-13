import { describe, expect, it } from 'vitest';
import { readDatabaseEnvironment } from '../src/config/database-env.js';
import { databaseFailureCategory } from '../src/utils/database-error.js';

const configuration = {
  DATABASE_URL: 'postgresql://demo:fictional@localhost:5432/test',
  DIRECT_URL: 'postgresql://demo:fictional@localhost:5432/test',
  SUPABASE_URL: 'https://fictional.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fictional_test_only',
};

describe('database configuration', () => {
  it('accepts complete server configuration', () => {
    expect(readDatabaseEnvironment(configuration)).toEqual(configuration);
  });
  it('uses the runtime connection when no separate migration URL is supplied', () => {
    const { DIRECT_URL: _direct, ...settings } = configuration;
    expect(readDatabaseEnvironment(settings).DIRECT_URL).toBe(configuration.DATABASE_URL);
  });
  it('supports a legacy public key with an empty publishable-key placeholder', () => {
    expect(readDatabaseEnvironment({ ...configuration, SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_ANON_KEY: 'legacy_public_test_key_only' }).SUPABASE_PUBLISHABLE_KEY).toBe('legacy_public_test_key_only');
  });
  it.each(['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'])('requires %s', (key) => {
    expect(() => readDatabaseEnvironment({ ...configuration, [key]: '' })).toThrow(key);
  });
  it.each(['https://example.test', 'postgresql://demo@localhost/db', 'postgresql://demo:[YOUR-PASSWORD]@localhost/db'])('rejects incomplete database URL %s', (url) => {
    expect(() => readDatabaseEnvironment({ ...configuration, DATABASE_URL: url })).toThrow('DATABASE_URL');
  });
  it('keeps private input out of validation errors', () => {
    expect(() => readDatabaseEnvironment({ ...configuration, DATABASE_URL: 'secret-private-input' }))
      .toThrow('Invalid database/Auth configuration: DATABASE_URL');
  });
});

describe('safe database diagnosis', () => {
  it('recognises nested PostgreSQL authentication failures', () => {
    expect(databaseFailureCategory({ meta: { driverAdapterError: { cause: { originalCode: '28P01', originalMessage: 'private password authentication failed' } } } }))
      .toBe('authentication');
  });
  it('handles cyclic errors safely', () => {
    const error: { cause?: unknown; code: string } = { code: 'ENOTFOUND' };
    error.cause = error;
    expect(databaseFailureCategory(error)).toBe('DNS resolution');
  });
  it('recognises certificates without returning original messages', () => {
    expect(databaseFailureCategory(new Error('private host: self signed certificate'))).toBe('TLS certificate');
  });
});
