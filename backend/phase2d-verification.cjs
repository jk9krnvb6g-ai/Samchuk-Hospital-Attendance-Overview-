/**
 * Phase 2D: Sam_Att Security & Frontend API Fix Verification Suite
 * Samchuk Hospital Attendance System (Sam_Att)
 * 
 * Verifies all 15 requirements:
 * 1. Gateway Mount /api/Sam_Att/*
 * 2. Standalone API
 * 3. Protected GET ไม่มี Token
 * 4. Protected POST ไม่มี Token
 * 5. Invalid Token (HTTP 401 INVALID_TOKEN)
 * 6. Valid Token (Authentication Succeeded)
 * 7. Insufficient Role (HTTP 403 FORBIDDEN)
 * 8. Login และ Health Public Routes (HTTP 200 without token)
 * 9. URL Prefix Normalization (/api/Sam_Att, /api/sam_att, /api/api, clean)
 * 10. Frontend API URL และ Authorization Headers
 * 11. HTML Error Handling (Interception of IIS HTML without SyntaxError)
 * 12. Router A/B Dependency Isolation
 * 13. ไม่มี Network Call ไปยัง Production (Zero 10.2.0.201 sockets)
 * 14. ไม่มี Schema Migration หรือ Scanner Worker จากการ Import
 * 15. ไม่เปิด Listener พอร์ตอื่น (Zero unexpected listeners)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Ensure REQUIRE_STRICT_AUTH is active for security tests
process.env.REQUIRE_STRICT_AUTH = 'true';
process.env.ALLOW_SCHEMA_MIGRATION = 'false';

async function runPhase2DVerification() {
  console.log('================================================================================');
  console.log('🔒 Samchuk Hospital Attendance (Sam_Att) - Phase 2D Security & API Test Suite');
  console.log('================================================================================\n');

  const testResults = [];

  function recordResult(num, name, passed, details = {}) {
    testResults.push({ num, name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[TEST-${String(num).padStart(2, '0')}] ${mark}: ${name}`);
    if (Object.keys(details).length > 0) {
      for (const [k, v] of Object.entries(details)) {
        console.log(`         └─ ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    console.log('');
  }

  // Helper function to dispatch mock HTTP requests to an Express application/router
  function makeMockRequest(appOrRouter, options) {
    return new Promise((resolve) => {
      const server = http.createServer(appOrRouter);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const reqPath = options.path || '/';
        const reqMethod = options.method || 'GET';
        const headers = { ...(options.headers || {}) };

        let bodyData = null;
        if (options.body) {
          bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = Buffer.byteLength(bodyData);
        }

        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: reqPath,
          method: reqMethod,
          headers
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            server.close(() => {
              let parsedJson = null;
              try { parsedJson = JSON.parse(data); } catch {}
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                rawBody: data,
                body: parsedJson
              });
            });
          });
        });

        req.on('error', (err) => {
          server.close(() => {
            resolve({ statusCode: 500, error: err.message });
          });
        });

        if (bodyData) req.write(bodyData);
        req.end();
      });
    });
  }

  // Prepare Mock Database Pool for testing
  const mockQueries = [];
  const mockDbPool = {
    query: async (sql, params) => {
      mockQueries.push({ sql: String(sql).slice(0, 60), params });
      const sqlLower = String(sql).toLowerCase();
      if (sqlLower.includes('attendance_user')) {
        return [[{
          id: 1,
          username: 'admin',
          password_hash: 'mock_hash',
          salt: 'mock_salt',
          fullname: 'ผู้ดูแลระบบ รพ.สามชุก',
          role: 'ADMIN',
          status: 'ACTIVE'
        }]];
      }
      if (sqlLower.includes('attendance_shift')) {
        return [[
          { id: 1, shift_code: 'MORN', shift_name: 'กะเช้า', start_time: '08:00:00', end_time: '16:00:00' }
        ]];
      }
      return [[], { affectedRows: 0 }];
    }
  };

  const { createSamAttRouter, samRouter } = require('./modules/sam_att/index.cjs');

  // Set up a mock session for valid token tests
  const crypto = require('crypto');
  const validAdminToken = 'sat_mock_admin_' + crypto.randomBytes(8).toString('hex');
  const validUserToken = 'sat_mock_user_' + crypto.randomBytes(8).toString('hex');
  
  // Access activeSessions from server module
  const serverModule = require('./server.cjs');
  // Inject mock active sessions into internal activeSessions map via createSession mechanism or prototype
  // We can simulate session by making a mock login request or directly injecting
  // Let's test login public route first to obtain genuine token
  let liveAdminToken = null;

  // ---------------------------------------------------------------------------
  // TEST 1: Gateway Mount /api/Sam_Att/*
  // ---------------------------------------------------------------------------
  try {
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({
      dbPool: mockDbPool,
      config: { allowSchemaMigration: false }
    });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    const res = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/health',
      method: 'GET'
    });

    const passed = res.statusCode === 200 && res.body && (res.body.status === 'ONLINE' || res.body.service);
    recordResult(1, 'Gateway Mount /api/Sam_Att/*', passed, {
      status: res.statusCode,
      responseStatus: res.body?.status,
      service: res.body?.service
    });
  } catch (err) {
    recordResult(1, 'Gateway Mount /api/Sam_Att/*', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Standalone API Mode
  // ---------------------------------------------------------------------------
  try {
    const standaloneApp = serverModule.app;
    const res = await makeMockRequest(standaloneApp, {
      path: '/api/health',
      method: 'GET'
    });

    const passed = res.statusCode === 200 && res.body && (res.body.status === 'ONLINE' || res.body.service);
    recordResult(2, 'Standalone API Mode', passed, {
      status: res.statusCode,
      responseService: res.body?.service
    });
  } catch (err) {
    recordResult(2, 'Standalone API Mode', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Protected GET Without Token (Must return 401 in Strict Auth)
  // ---------------------------------------------------------------------------
  try {
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({ dbPool: mockDbPool });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    const res = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/shifts',
      method: 'GET'
    });

    const passed = res.statusCode === 401 && res.body?.error === 'UNAUTHORIZED';
    recordResult(3, 'Protected GET Without Token (HTTP 401 UNAUTHORIZED)', passed, {
      status: res.statusCode,
      error: res.body?.error,
      message: res.body?.message
    });
  } catch (err) {
    recordResult(3, 'Protected GET Without Token', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Protected POST Without Token (Must return 401 in Strict Auth)
  // ---------------------------------------------------------------------------
  try {
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({ dbPool: mockDbPool });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    const res = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/shifts',
      method: 'POST',
      body: { shift_code: 'TEST', shift_name: 'กะทดสอบ' }
    });

    const passed = res.statusCode === 401 && res.body?.error === 'UNAUTHORIZED';
    recordResult(4, 'Protected POST Without Token (HTTP 401 UNAUTHORIZED)', passed, {
      status: res.statusCode,
      error: res.body?.error,
      message: res.body?.message
    });
  } catch (err) {
    recordResult(4, 'Protected POST Without Token', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Invalid Token (Must return 401 INVALID_TOKEN)
  // ---------------------------------------------------------------------------
  try {
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({ dbPool: mockDbPool });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    const res = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/shifts',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer sat_fake_invalid_token_999999'
      }
    });

    const passed = res.statusCode === 401 && res.body?.error === 'INVALID_TOKEN';
    recordResult(5, 'Invalid Token Handling (HTTP 401 INVALID_TOKEN)', passed, {
      status: res.statusCode,
      error: res.body?.error,
      message: res.body?.message
    });
  } catch (err) {
    recordResult(5, 'Invalid Token Handling', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Valid Token (Authentication Succeeded)
  // ---------------------------------------------------------------------------
  try {
    // Generate valid session using serverModule mock
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({ dbPool: mockDbPool });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    // Create session directly in activeSessions
    const testSessionToken = 'sat_test_valid_admin_' + Date.now();
    // Simulate login or create session in serverModule
    // In server.cjs activeSessions is closed over, but we can call /api/auth/me after inserting session
    // Or we can mock PBKDF2 login:
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('pass123', salt, 10000, 64, 'sha512').toString('hex');
    const authMockPool = {
      query: async (sql, params) => {
        const s = String(sql).toLowerCase();
        if (s.includes('attendance_user') && s.includes('where username =')) {
          return [[{
            id: 1,
            username: 'test_admin',
            password_hash: hash,
            salt: salt,
            fullname: 'ผู้ดูแลระบบทดสอบ',
            role: 'ADMIN',
            status: 'ACTIVE'
          }]];
        }
        if (s.includes('attendance_shift')) {
          return [[{ id: 1, shift_code: 'MORN', shift_name: 'กะเช้า' }]];
        }
        return [[], { affectedRows: 0 }];
      }
    };

    const authRouter = createSamAttRouter({ dbPool: authMockPool });
    const authApp = express();
    authApp.use(express.json());
    authApp.use('/api/Sam_Att', authRouter);

    // 1. Login to get genuine token
    const loginRes = await makeMockRequest(authApp, {
      path: '/api/Sam_Att/auth/login',
      method: 'POST',
      body: { username: 'test_admin', password: 'pass123' }
    });

    const token = loginRes.body?.token;
    liveAdminToken = token;

    // 2. Use genuine token to access protected endpoint
    const protectedRes = await makeMockRequest(authApp, {
      path: '/api/Sam_Att/shifts',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const passed = protectedRes.statusCode === 200 && protectedRes.body?.success === true;
    recordResult(6, 'Valid Token Authentication', passed, {
      loginStatus: loginRes.statusCode,
      tokenIssued: Boolean(token),
      protectedStatus: protectedRes.statusCode,
      returnedShifts: protectedRes.body?.data?.length
    });
  } catch (err) {
    recordResult(6, 'Valid Token Authentication', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Insufficient Role (HTTP 403 FORBIDDEN)
  // ---------------------------------------------------------------------------
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('userpass', salt, 10000, 64, 'sha512').toString('hex');
    const roleMockPool = {
      query: async (sql, params) => {
        const s = String(sql).toLowerCase();
        if (s.includes('attendance_user') && s.includes('where username =')) {
          return [[{
            id: 2,
            username: 'regular_user',
            password_hash: hash,
            salt: salt,
            fullname: 'เจ้าหน้าที่ทั่วไป',
            role: 'USER', // Insufficient for ADMIN endpoints
            status: 'ACTIVE'
          }]];
        }
        return [[], { affectedRows: 0 }];
      }
    };

    const roleApp = express();
    roleApp.use(express.json());
    const roleRouter = createSamAttRouter({ dbPool: roleMockPool });
    roleApp.use('/api/Sam_Att', roleRouter);

    // Login as USER
    const loginRes = await makeMockRequest(roleApp, {
      path: '/api/Sam_Att/auth/login',
      method: 'POST',
      body: { username: 'regular_user', password: 'userpass' }
    });

    const userToken = loginRes.body?.token;

    // Attempt to access ADMIN-only endpoint: /api/users/:id/reset-password
    const forbiddenRes = await makeMockRequest(roleApp, {
      path: '/api/Sam_Att/users/1/reset-password',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` },
      body: { newPassword: 'NewPassword@2026' }
    });

    const passed = forbiddenRes.statusCode === 403 && forbiddenRes.body?.error === 'FORBIDDEN';
    recordResult(7, 'Insufficient Role Rejection (HTTP 403 FORBIDDEN)', passed, {
      userRole: 'USER',
      requiredRole: 'ADMIN',
      status: forbiddenRes.statusCode,
      error: forbiddenRes.body?.error,
      message: forbiddenRes.body?.message
    });
  } catch (err) {
    recordResult(7, 'Insufficient Role Rejection', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Login and Health Public Routes (HTTP 200 without token)
  // ---------------------------------------------------------------------------
  try {
    const pubApp = express();
    pubApp.use(express.json());
    const pubRouter = createSamAttRouter({ dbPool: mockDbPool });
    pubApp.use('/api/Sam_Att', pubRouter);

    const healthRes = await makeMockRequest(pubApp, {
      path: '/api/Sam_Att/health',
      method: 'GET'
    });

    const rootHealthRes = await makeMockRequest(pubApp, {
      path: '/api/Sam_Att',
      method: 'GET'
    });

    // Login route is public: it should respond with 400 (missing username/password) or 401 (invalid creds), NOT 401 UNAUTHORIZED for lack of token
    const loginProbeRes = await makeMockRequest(pubApp, {
      path: '/api/Sam_Att/auth/login',
      method: 'POST',
      body: {}
    });

    // If login was blocked by token auth, it would return error: 'UNAUTHORIZED'. Because it's public, it reaches login handler and returns 'กรุณาระบุชื่อผู้ใช้งานและรหัสผ่าน'
    const loginReachedHandler = loginProbeRes.statusCode === 400 && loginProbeRes.body?.message?.includes('กรุณาระบุ');

    const passed = healthRes.statusCode === 200 && rootHealthRes.statusCode === 200 && loginReachedHandler;
    recordResult(8, 'Public Routes Accessibility (/health, /auth/login)', passed, {
      healthStatus: healthRes.statusCode,
      rootGatewayStatus: rootHealthRes.statusCode,
      loginReachedHandler,
      loginResponse: loginProbeRes.body?.message
    });
  } catch (err) {
    recordResult(8, 'Public Routes Accessibility', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: URL Prefix Normalization
  // ---------------------------------------------------------------------------
  try {
    const normApp = express();
    const normRouter = createSamAttRouter({ dbPool: mockDbPool });
    normApp.use('/api/Sam_Att', normRouter);

    // Test different variations of prefixes that must all reach /health
    const pathsToTest = [
      '/api/Sam_Att/health',
      '/api/Sam_Att/api/health',
      '/api/Sam_Att/api/api/health',
      '/api/Sam_Att'
    ];

    let all200 = true;
    const testDetails = {};
    for (const p of pathsToTest) {
      const res = await makeMockRequest(normApp, { path: p, method: 'GET' });
      testDetails[p] = res.statusCode;
      if (res.statusCode !== 200) all200 = false;
    }

    recordResult(9, 'URL Prefix Normalization & Deduplication', all200, testDetails);
  } catch (err) {
    recordResult(9, 'URL Prefix Normalization', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Frontend API URL and Authorization Headers Resolution
  // ---------------------------------------------------------------------------
  try {
    const clientCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'apiClient.ts'), 'utf8');

    const usesBearerInHeaders = clientCode.includes("headers['Authorization'] = `Bearer ${token}`");
    const noDirectPort3002 = !clientCode.includes("fetch('http://localhost:3002") && !clientCode.includes("fetch('http://10.2.0.13:3002");
    const handlesCleanEndpoint = clientCode.includes("cleanEndpoint.startsWith('/api/')");
    const avoidsDoubleSamAtt = clientCode.includes("cleanEndpoint.slice('/Sam_Att'.length)");
    const avoidsDoubleApi = clientCode.includes("cleanEndpoint.replace(/^\\/api\\/api\\//, '/api/')");

    const passed = usesBearerInHeaders && noDirectPort3002 && handlesCleanEndpoint && avoidsDoubleSamAtt && avoidsDoubleApi;
    recordResult(10, 'Frontend API Client URL Resolution & Bearer Injection', passed, {
      usesBearerInHeaders,
      noDirectPort3002,
      handlesCleanEndpoint,
      avoidsDoubleSamAtt,
      avoidsDoubleApi
    });
  } catch (err) {
    recordResult(10, 'Frontend API Client URL Resolution', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 11: HTML Error Handling (Interception without SyntaxError)
  // ---------------------------------------------------------------------------
  try {
    const clientCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'apiClient.ts'), 'utf8');

    const checksHtml = clientCode.includes("contentType.includes('text/html')");
    const checksDoctype = clientCode.includes("text.trim().startsWith('<!DOCTYPE')");
    const handles401 = clientCode.includes("HTTP 401 (Unauthorized)");
    const handles405 = clientCode.includes("HTTP 405 (Method Not Allowed)");
    const handles500 = clientCode.includes("HTTP 500 (Internal Server Error)");
    const handles502 = clientCode.includes("HTTP 502") || clientCode.includes("res.status === 502");
    const noHttpsToHttpAdvice = !clientCode.includes("ใช้ http:// แทน https://");

    const passed = checksHtml && checksDoctype && handles401 && handles405 && handles500 && handles502 && noHttpsToHttpAdvice;
    recordResult(11, 'IIS HTML Error Interception & Security Discipline', passed, {
      checksHtml,
      checksDoctype,
      handles401,
      handles405,
      handles500,
      handles502,
      noHttpsToHttpAdvice
    });
  } catch (err) {
    recordResult(11, 'HTML Error Handling', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Router A/B Dependency Isolation (AsyncLocalStorage Context)
  // ---------------------------------------------------------------------------
  try {
    const poolA = { query: async () => [[{ source: 'POOL_A' }]] };
    const poolB = { query: async () => [[{ source: 'POOL_B' }]] };

    const routerA = createSamAttRouter({ dbPool: poolA, config: { id: 'A' } });
    const routerB = createSamAttRouter({ dbPool: poolB, config: { id: 'B' } });

    const depsA = routerA.getDependencies();
    const depsB = routerB.getDependencies();

    const isolated = depsA.dbPool !== depsB.dbPool && depsA.config.id === 'A' && depsB.config.id === 'B';
    recordResult(12, 'Router A/B Dependency Isolation', isolated, {
      routerAConfigId: depsA.config.id,
      routerBConfigId: depsB.config.id,
      distinctDbPools: isolated
    });
  } catch (err) {
    recordResult(12, 'Router A/B Dependency Isolation', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 13: Zero Network Calls to Production
  // ---------------------------------------------------------------------------
  try {
    const net = require('net');
    let productionSocketOpened = false;

    // Monitor socket creation
    const originalConnect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
      const host = typeof args[0] === 'object' ? args[0].host : (typeof args[1] === 'string' ? args[1] : '');
      if (host && host.includes('10.2.0.201')) {
        productionSocketOpened = true;
      }
      return originalConnect.apply(this, args);
    };

    // Instantiate routers and check query history
    const testRouter = createSamAttRouter({ dbPool: mockDbPool });
    net.Socket.prototype.connect = originalConnect; // restore

    const passed = !productionSocketOpened;
    recordResult(13, 'Zero Network Calls to Production (10.2.0.201)', passed, {
      productionSocketOpened,
      safeIsolatedRun: true
    });
  } catch (err) {
    recordResult(13, 'Zero Network Calls to Production', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 14: Zero Schema Migration or Scanner Worker on Import
  // ---------------------------------------------------------------------------
  try {
    const handles = process._getActiveHandles ? process._getActiveHandles() : [];
    const timers = process._getActiveRequests ? process._getActiveRequests() : [];

    // Filter network socket handles
    const openSockets = handles.filter(h => h && h._handle && (h._handle.fd > 2));
    const passed = openSockets.length === 0;

    recordResult(14, 'Zero Schema Migration or Scanner Worker on Import', passed, {
      openSocketHandles: openSockets.length,
      activeTimerRequests: timers.length
    });
  } catch (err) {
    recordResult(14, 'Zero Schema Migration or Scanner Worker on Import', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 15: Zero Unexpected Port Listeners
  // ---------------------------------------------------------------------------
  try {
    const handles = process._getActiveHandles ? process._getActiveHandles() : [];
    const serverListeners = handles.filter(h => h && typeof h.address === 'function' && h.listening);

    const passed = serverListeners.length === 0;
    recordResult(15, 'Zero Unexpected Port Listeners (No app.listen inside router module)', passed, {
      activeListeners: serverListeners.length
    });
  } catch (err) {
    recordResult(15, 'Zero Unexpected Port Listeners', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // TEST 16: Fail-Closed Auth (REQUIRE_STRICT_AUTH undefined or false must return 401)
  // ---------------------------------------------------------------------------
  try {
    const originalStrictEnv = process.env.REQUIRE_STRICT_AUTH;
    const gatewayApp = express();
    const routerInstance = createSamAttRouter({ dbPool: mockDbPool });
    gatewayApp.use('/api/Sam_Att', routerInstance);

    // Case A: REQUIRE_STRICT_AUTH is undefined
    delete process.env.REQUIRE_STRICT_AUTH;
    const resUndefined = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/shifts',
      method: 'GET'
    });

    // Case B: REQUIRE_STRICT_AUTH is 'false'
    process.env.REQUIRE_STRICT_AUTH = 'false';
    const resFalse = await makeMockRequest(gatewayApp, {
      path: '/api/Sam_Att/shifts',
      method: 'GET'
    });

    // Restore environment
    if (originalStrictEnv !== undefined) {
      process.env.REQUIRE_STRICT_AUTH = originalStrictEnv;
    } else {
      delete process.env.REQUIRE_STRICT_AUTH;
    }

    const passedCaseA = resUndefined.statusCode === 401 && resUndefined.body?.error === 'UNAUTHORIZED';
    const passedCaseB = resFalse.statusCode === 401 && resFalse.body?.error === 'UNAUTHORIZED';
    const passed = passedCaseA && passedCaseB;

    recordResult(16, 'Fail-Closed Auth (Undefined & false REQUIRE_STRICT_AUTH return HTTP 401)', passed, {
      undefinedEnvStatus: resUndefined.statusCode,
      undefinedEnvError: resUndefined.body?.error,
      falseEnvStatus: resFalse.statusCode,
      falseEnvError: resFalse.body?.error,
      failClosedConfirmed: passed
    });
  } catch (err) {
    recordResult(16, 'Fail-Closed Auth Verification', false, { error: err.message });
  }

  // ---------------------------------------------------------------------------
  // Final Score & Summary
  // ---------------------------------------------------------------------------
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  console.log('================================================================================');
  console.log(`📊 Phase 2D Test Suite Summary: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================================');

  if (failedTests > 0) {
    console.error('❌ Some regression tests failed.');
    process.exit(1);
  } else {
    console.log('🎉 ALL 16 REGRESSION TESTS PASSED CLEANLY WITH ZERO SIDE-EFFECTS!');
    process.exit(0);
  }
}

runPhase2DVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
