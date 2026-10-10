const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  MISSING_MESSAGE,
  mongoIdentity,
  resolveTestDatabase,
  assertTestDatabase,
} = require('./_testDb');
const { DEV_MISSING_MESSAGE, resolveAppDatabase } = require('../config/databaseUri');

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

describe('app database selection', () => {
  const DEV = 'mongodb+srv://devuser:devpass@cluster0.abcde.mongodb.net/cove_dev?retryWrites=true';

  it('production connects to MONGODB_URI only', () => {
    assert.deepEqual(
      resolveAppDatabase({ NODE_ENV: 'production', MONGODB_URI: PROD, DEV_MONGODB_URI: DEV }),
      { uri: PROD, dbName: 'cove', variable: 'MONGODB_URI' }
    );
    assert.throws(() => resolveAppDatabase({ NODE_ENV: 'production', DEV_MONGODB_URI: DEV }), /MONGODB_URI is missing/);
    assert.throws(
      () => resolveAppDatabase({ NODE_ENV: 'production', MONGODB_URI: 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/cove' }),
      /not a real Atlas connection string/
    );
    assert.throws(
      () => resolveAppDatabase({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/cove' }),
      /not a real Atlas connection string/
    );
  });

  it('development never falls back to MONGODB_URI', () => {
    for (const nodeEnv of [undefined, '', 'development', 'staging']) {
      assert.throws(() => resolveAppDatabase({ NODE_ENV: nodeEnv, MONGODB_URI: PROD }), { message: DEV_MISSING_MESSAGE }, String(nodeEnv));
      assert.throws(() => resolveAppDatabase({ NODE_ENV: nodeEnv, MONGODB_URI: PROD, DEV_MONGODB_URI: '  ' }), { message: DEV_MISSING_MESSAGE });
    }
  });

  it('development refuses the production database however it is written', () => {
    const production = [
      PROD,
      'mongodb+srv://otheruser:otherpass@CLUSTER0.ABCDE.MONGODB.NET/cove',
      'mongodb+srv://cluster0.abcde.mongodb.net/COVE?appName=dev',
      'mongodb://cluster0-shard-00-00.abcde.mongodb.net:27017/cove?ssl=true',
    ];
    for (const candidate of production) {
      assert.throws(
        () => resolveAppDatabase({ NODE_ENV: 'development', MONGODB_URI: PROD, DEV_MONGODB_URI: candidate }),
        /points to the production database/,
        candidate
      );
    }
  });

  it('development requires a named, real development database', () => {
    assert.throws(
      () => resolveAppDatabase({ MONGODB_URI: PROD, DEV_MONGODB_URI: 'mongodb+srv://u:p@cluster0.abcde.mongodb.net/' }),
      /must name a development database/
    );
    assert.throws(
      () => resolveAppDatabase({ DEV_MONGODB_URI: 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/cove_dev' }),
      /placeholder values/
    );
    assert.throws(() => resolveAppDatabase({ DEV_MONGODB_URI: 'postgres://x/cove_dev' }), /not a valid MongoDB/);
  });

  it('development accepts a separate database on the same cluster, another cluster or locally', () => {
    assert.deepEqual(
      resolveAppDatabase({ NODE_ENV: 'development', MONGODB_URI: PROD, DEV_MONGODB_URI: DEV }),
      { uri: DEV, dbName: 'cove_dev', variable: 'DEV_MONGODB_URI' }
    );
    const otherCluster = 'mongodb+srv://u:p@cove-dev.xyz12.mongodb.net/cove';
    assert.equal(resolveAppDatabase({ MONGODB_URI: PROD, DEV_MONGODB_URI: otherCluster }).dbName, 'cove');
    const local = 'mongodb://127.0.0.1:27017/cove_dev';
    assert.equal(resolveAppDatabase({ DEV_MONGODB_URI: local }).variable, 'DEV_MONGODB_URI');
  });

  it('test mode exposes no app database at all', () => {
    assert.deepEqual(
      resolveAppDatabase({ COVE_TEST_MODE: 'true', NODE_ENV: 'production', MONGODB_URI: PROD, DEV_MONGODB_URI: DEV }),
      { uri: '', dbName: '', variable: '' }
    );
  });
});
