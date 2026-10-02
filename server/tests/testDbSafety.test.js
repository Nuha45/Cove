const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  MISSING_MESSAGE,
  mongoIdentity,
  resolveTestDatabase,
  assertTestDatabase,
} = require('./_testDb');

// Fake URIs only. These tests never open a database connection.
const PROD = 'mongodb+srv://produser:prodpass@cluster0.abcde.mongodb.net/cove?retryWrites=true&w=majority';

describe('test database isolation', () => {
  it('A. a missing TEST_MONGODB_URI fails with a clear message and never falls back', () => {
    assert.throws(() => resolveTestDatabase({ MONGODB_URI: PROD }), { message: MISSING_MESSAGE });
    assert.throws(() => resolveTestDatabase({ MONGODB_URI: PROD, TEST_MONGODB_URI: '   ' }), { message: MISSING_MESSAGE });
    assert.throws(() => resolveTestDatabase({}), { message: MISSING_MESSAGE });
  });

  it('A. under tests the app config exposes no production URI and connectDB refuses to run', async () => {
    const env = require('../config/env');
    assert.equal(env.testMode, true);
    assert.equal(env.mongoUri, '');
    const connectDB = require('../config/db');
    await assert.rejects(connectDB(), /must never run under tests/);
    assert.equal(mongoose.connection.readyState, 0);
  });

  it('B. TEST_MONGODB_URI pointing at the production database is rejected', () => {
    const sameDatabase = [
      PROD,
      'mongodb+srv://otheruser:otherpass@CLUSTER0.ABCDE.MONGODB.NET/cove',
      'mongodb+srv://cluster0.abcde.mongodb.net/cove?appName=tests&w=1',
      'mongodb+srv://produser:prodpass@cluster0.abcde.mongodb.net/COVE',
      'mongodb://cluster0-shard-00-00.abcde.mongodb.net:27017,cluster0-shard-00-01.abcde.mongodb.net:27017/cove?ssl=true',
    ];
    for (const candidate of sameDatabase) {
      assert.throws(
        () => resolveTestDatabase({ MONGODB_URI: PROD, TEST_MONGODB_URI: candidate }),
        /production database|must be a dedicated test database/,
        candidate
      );
    }

    const prodTest = 'mongodb://a.example.net:27017,b.example.net/cove_test_shared';
    assert.throws(
      () => resolveTestDatabase({ MONGODB_URI: prodTest, TEST_MONGODB_URI: 'mongodb://b.example.net:27017,c.example.net/cove_test_shared?ssl=true' }),
      /production database/
    );
    assert.throws(
      () => resolveTestDatabase({ MONGODB_URI: prodTest, TEST_MONGODB_URI: prodTest }),
      /production database/
    );
  });

  it('B. a test URI without a dedicated test database name is rejected', () => {
    assert.throws(
      () => resolveTestDatabase({ TEST_MONGODB_URI: 'mongodb+srv://u:p@cluster9.zzz.mongodb.net/' }),
      /must name a dedicated test database/
    );
    assert.throws(
      () => resolveTestDatabase({ TEST_MONGODB_URI: 'mongodb+srv://u:p@cluster9.zzz.mongodb.net/cove' }),
      /must be a dedicated test database/
    );
    assert.throws(() => resolveTestDatabase({ TEST_MONGODB_URI: 'postgres://x/cove_test' }), /not a valid MongoDB/);
  });

  it('C. a different database is accepted, on the same cluster or without a production URI', () => {
    const sameCluster = 'mongodb+srv://testuser:testpass@cluster0.abcde.mongodb.net/cove_test?retryWrites=true';
    assert.deepEqual(
      resolveTestDatabase({ MONGODB_URI: PROD, TEST_MONGODB_URI: sameCluster }),
      { uri: sameCluster, dbName: 'cove_test' }
    );
    const otherCluster = 'mongodb+srv://u:p@cove-test.xyz12.mongodb.net/cove_test';
    assert.equal(resolveTestDatabase({ MONGODB_URI: PROD, TEST_MONGODB_URI: otherCluster }).dbName, 'cove_test');
    const local = 'mongodb://127.0.0.1:27017/cove_test';
    assert.equal(resolveTestDatabase({ TEST_MONGODB_URI: local }).dbName, 'cove_test');
  });

  it('normalizes credentials, options, case and host order out of the identity', () => {
    assert.deepEqual(
      mongoIdentity('mongodb://u:p@B.example.net,a.example.net:27018/cove_test?ssl=true'),
      { scheme: 'mongodb', hosts: ['a.example.net:27018', 'b.example.net:27017'], dbName: 'cove_test' }
    );
  });

  it('D. cleanup and index setup are only allowed on the verified test database', () => {
    const connectedTo = (databaseName) => ({ db: { databaseName } });
    assert.equal(assertTestDatabase(connectedTo('cove_test'), 'cove_test'), 'cove_test');
    assert.throws(() => assertTestDatabase(connectedTo('cove'), 'cove_test'), /Refusing to touch database "cove"/);
    assert.throws(() => assertTestDatabase(connectedTo('cove_test_other'), 'cove_test'), /Refusing/);
    assert.throws(() => assertTestDatabase(connectedTo('cove'), 'cove'), /Refusing/);
    assert.throws(() => assertTestDatabase({}, 'cove_test'), /Refusing to touch database "unknown"/);
  });
});
