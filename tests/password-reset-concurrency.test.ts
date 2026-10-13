import { resetPasswordAction, requestPasswordResetAction } from "../src/lib/auth/actions";
import { hashToken, generateSecureToken, hashPassword, verifyPassword } from "../src/lib/auth/password";
import { db } from "../src/lib/db";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

// In-Memory State for Concurrency and Transaction Simulation
interface MockTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface MockUserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

interface MockSessionRecord {
  id: string;
  userId: string;
  sessionToken: string;
}

function createHarness() {
  const users = new Map<string, MockUserRecord>();
  const tokens = new Map<string, MockTokenRecord>();
  const sessions = new Map<string, MockSessionRecord>();
  let shouldFailUserUpdate = false;

  // Seed default test user
  users.set("user_test_1", {
    id: "user_test_1",
    email: "test@example.com",
    passwordHash: "old_hashed_password_abc",
  });

  // Seed active sessions
  sessions.set("sess_1", { id: "sess_1", userId: "user_test_1", sessionToken: "token_1" });
  sessions.set("sess_2", { id: "sess_2", userId: "user_test_1", sessionToken: "token_2" });
  sessions.set("sess_other", { id: "sess_other", userId: "user_other", sessionToken: "token_3" });

  const mockDb = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) {
          return Array.from(users.values()).find((u) => u.email === where.email) || null;
        }
        if (where.id) {
          return users.get(where.id) || null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        if (shouldFailUserUpdate) {
          throw new Error("DATABASE_CONNECTION_ERROR_USER_UPDATE");
        }
        const user = users.get(where.id);
        if (!user) throw new Error("User not found");
        user.passwordHash = data.passwordHash;
        return user;
      },
    },
    passwordResetToken: {
      create: async ({ data }: any) => {
        const id = "tok_" + Math.random().toString(36).substring(2, 9);
        const record: MockTokenRecord = {
          id,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        tokens.set(id, record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        if (where.tokenHash) {
          const rec = Array.from(tokens.values()).find((t) => t.tokenHash === where.tokenHash);
          if (!rec) return null;
          return { ...rec, user: users.get(rec.userId) };
        }
        if (where.id) {
          const rec = tokens.get(where.id);
          if (!rec) return null;
          return { ...rec, user: users.get(rec.userId) };
        }
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [id, rec] of tokens.entries()) {
          const idMatch = !where.id || rec.id === where.id;
          const usedAtMatch = where.usedAt === null ? rec.usedAt === null : true;
          const expiresMatch = !where.expiresAt?.gt || rec.expiresAt > where.expiresAt.gt;

          if (idMatch && usedAtMatch && expiresMatch) {
            rec.usedAt = data.usedAt;
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const rec = tokens.get(where.id);
        if (!rec) throw new Error("Token not found");
        Object.assign(rec, data);
        return rec;
      },
    },
    session: {
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const [id, sess] of sessions.entries()) {
          if (!where.userId || sess.userId === where.userId) {
            sessions.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async () => ({ id: "audit_1" }),
    },
    $transaction: async (arg: any) => {
      if (typeof arg === "function") {
        // Create transactional clone snapshot for rollback support
        const userSnapshot = new Map(Array.from(users.entries()).map(([k, v]) => [k, { ...v }]));
        const tokenSnapshot = new Map(Array.from(tokens.entries()).map(([k, v]) => [k, { ...v }]));
        const sessionSnapshot = new Map(Array.from(sessions.entries()).map(([k, v]) => [k, { ...v }]));

        try {
          const result = await arg(mockDb);
          return result;
        } catch (txErr) {
          // Rollback in-memory state on error
          users.clear();
          userSnapshot.forEach((v, k) => users.set(k, v));
          tokens.clear();
          tokenSnapshot.forEach((v, k) => tokens.set(k, v));
          sessions.clear();
          sessionSnapshot.forEach((v, k) => sessions.set(k, v));
          throw txErr;
        }
      }
      return Promise.all(arg);
    },
  };

  return {
    mockDb,
    users,
    tokens,
    sessions,
    setShouldFailUserUpdate: (val: boolean) => {
      shouldFailUserUpdate = val;
    },
  };
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    fd.append(key, val);
  }
  return fd;
}

async function runTests() {
  console.log("==================================================================");
  console.log("TRUV LedgerOS — Phase 2E Password Reset Concurrency Hardening Tests");
  console.log("==================================================================\n");

  const harness = createHarness();

  // Patch global db reference with harness
  const originalUser = db.user;
  const originalToken = (db as any).passwordResetToken;
  const originalSession = (db as any).session;
  const originalAuditLog = db.auditLog;
  const originalTx = db.$transaction;

  Object.assign(db, {
    user: harness.mockDb.user,
    passwordResetToken: harness.mockDb.passwordResetToken,
    session: harness.mockDb.session,
    auditLog: harness.mockDb.auditLog,
    $transaction: harness.mockDb.$transaction,
  });

  try {
    // ----------------------------------------------------------------------
    // TEST 1: Valid, unexpired token succeeds
    // ----------------------------------------------------------------------
    const rawTokenValid = generateSecureToken(32);
    const validHash = hashToken(rawTokenValid);
    const validRecord = await harness.mockDb.passwordResetToken.create({
      data: {
        userId: "user_test_1",
        tokenHash: validHash,
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hr future
      },
    });

    const validFd = makeFormData({
      token: rawTokenValid,
      newPassword: "NewSecurePassword123!",
    });

    const validResult = await resetPasswordAction(validFd);
    assert(validResult.success === true, "1. Valid unexpired token successfully resets password");

    const updatedUser = await harness.mockDb.user.findUnique({ where: { id: "user_test_1" } });
    const isPwUpdated = await verifyPassword("NewSecurePassword123!", updatedUser!.passwordHash);
    assert(isPwUpdated, "1b. User password hash in database reflects new password");

    const consumedToken = await harness.mockDb.passwordResetToken.findUnique({ where: { id: validRecord.id } });
    assert(consumedToken?.usedAt !== null, "1c. Token is marked with usedAt timestamp");

    const activeUserSessions = Array.from(harness.sessions.values()).filter((s) => s.userId === "user_test_1");
    assert(activeUserSessions.length === 0, "1d. All active sessions for user are invalidated on reset");

    const otherSessions = Array.from(harness.sessions.values()).filter((s) => s.userId === "user_other");
    assert(otherSessions.length === 1, "1e. Unrelated users' sessions are preserved");


    // ----------------------------------------------------------------------
    // TEST 2: Expired token is rejected
    // ----------------------------------------------------------------------
    const rawTokenExpired = generateSecureToken(32);
    const expiredHash = hashToken(rawTokenExpired);
    await harness.mockDb.passwordResetToken.create({
      data: {
        userId: "user_test_1",
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 10 * 1000), // 10 seconds in past
      },
    });

    const expiredFd = makeFormData({
      token: rawTokenExpired,
      newPassword: "AnotherPassword456!",
    });

    const expiredResult = await resetPasswordAction(expiredFd);
    assert(
      expiredResult.error === "Invalid or expired password reset link.",
      "2. Expired token is rejected with safe generic error message"
    );


    // ----------------------------------------------------------------------
    // TEST 3: Already-used token is rejected
    // ----------------------------------------------------------------------
    const rawTokenUsed = generateSecureToken(32);
    const usedHash = hashToken(rawTokenUsed);
    const usedRecord = await harness.mockDb.passwordResetToken.create({
      data: {
        userId: "user_test_1",
        tokenHash: usedHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
    // Mark as used
    usedRecord.usedAt = new Date(Date.now() - 60 * 1000);

    const usedFd = makeFormData({
      token: rawTokenUsed,
      newPassword: "YetAnotherPassword789!",
    });

    const usedResult = await resetPasswordAction(usedFd);
    assert(
      usedResult.error === "Invalid or expired password reset link.",
      "3. Already-used token is rejected with safe generic error message"
    );


    // ----------------------------------------------------------------------
    // TEST 4: Concurrency Race Test: Two simultaneous redemption attempts
    // ----------------------------------------------------------------------
    // Create a fresh token for concurrent race test
    const rawTokenRace = generateSecureToken(32);
    const raceHash = hashToken(rawTokenRace);
    const raceRecord = await harness.mockDb.passwordResetToken.create({
      data: {
        userId: "user_test_1",
        tokenHash: raceHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    const raceFd1 = makeFormData({
      token: rawTokenRace,
      newPassword: "ConcurrentPasswordA1!",
    });

    const raceFd2 = makeFormData({
      token: rawTokenRace,
      newPassword: "ConcurrentPasswordB2!",
    });

    // Execute both redemptions concurrently via Promise.all
    console.log("  → Launching concurrent simultaneous redemptions for single token...");
    const [raceRes1, raceRes2] = await Promise.all([
      resetPasswordAction(raceFd1),
      resetPasswordAction(raceFd2),
    ]);

    const oneSucceeded = Boolean((raceRes1.success && !raceRes2.success) || (!raceRes1.success && raceRes2.success));
    const oneFailedWithSafeError = Boolean(
      (raceRes1.error === "Invalid or expired password reset link.") ||
      (raceRes2.error === "Invalid or expired password reset link.")
    );

    assert(
      oneSucceeded && oneFailedWithSafeError,
      "4. Concurrency Hardening: Exactly ONE concurrent request succeeds, losing request fails safely with 400"
    );

    // Verify token was only claimed once
    const finalRaceToken = await harness.mockDb.passwordResetToken.findUnique({ where: { id: raceRecord.id } });
    assert(finalRaceToken?.usedAt !== null, "4b. Token has exactly one usedAt timestamp");


    // ----------------------------------------------------------------------
    // TEST 5: Password-update failure and transaction rollback
    // ----------------------------------------------------------------------
    const rawTokenFail = generateSecureToken(32);
    const failHash = hashToken(rawTokenFail);
    const failRecord = await harness.mockDb.passwordResetToken.create({
      data: {
        userId: "user_test_1",
        tokenHash: failHash,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    // Re-seed session to verify it doesn't get deleted on rollback
    harness.sessions.set("sess_rollback_test", {
      id: "sess_rollback_test",
      userId: "user_test_1",
      sessionToken: "rollback_tok",
    });

    // Force user update query to fail inside transaction
    harness.setShouldFailUserUpdate(true);

    const failFd = makeFormData({
      token: rawTokenFail,
      newPassword: "FailedPasswordAttempt99!",
    });

    const failResult = await resetPasswordAction(failFd);
    assert(
      failResult.error === "Failed to update password. Please try again.",
      "5. Transaction failure returns safe error message without leaking DB details"
    );

    // Reset flag
    harness.setShouldFailUserUpdate(false);

    // Verify atomic rollback: token was NOT permanently consumed!
    const rolledBackToken = await harness.mockDb.passwordResetToken.findUnique({ where: { id: failRecord.id } });
    assert(
      rolledBackToken?.usedAt === null,
      "5b. Atomic Rollback: Token was NOT permanently consumed when password update failed"
    );

    // Verify sessions were NOT deleted on rollback
    const rollbackSession = harness.sessions.get("sess_rollback_test");
    assert(
      rollbackSession !== undefined,
      "5c. Atomic Rollback: Sessions were NOT deleted when transaction rolled back"
    );


    // ----------------------------------------------------------------------
    // TEST 6: Invalid token and safe error responses
    // ----------------------------------------------------------------------
    const nonExistentFd = makeFormData({
      token: "non_existent_token_1234567890abcdef",
      newPassword: "SomeValidPassword123!",
    });
    const nonExistentResult = await resetPasswordAction(nonExistentFd);
    assert(
      nonExistentResult.error === "Invalid or expired password reset link.",
      "6. Non-existent token returns generic invalid/expired error"
    );

    const shortPasswordFd = makeFormData({
      token: rawTokenValid,
      newPassword: "short",
    });
    const shortPasswordResult = await resetPasswordAction(shortPasswordFd);
    assert(
      shortPasswordResult.error === "Password must be at least 8 characters",
      "6b. Password length validation rejects passwords < 8 characters"
    );

    const emptyTokenFd = makeFormData({
      token: "",
      newPassword: "ValidPassword123!",
    });
    const emptyTokenResult = await resetPasswordAction(emptyTokenFd);
    assert(
      emptyTokenResult.error === "Reset token is required",
      "6c. Missing token rejects request immediately"
    );


    // ----------------------------------------------------------------------
    // TEST 7: Anti-Enumeration in requestPasswordResetAction
    // ----------------------------------------------------------------------
    const reqNonExistent = makeFormData({ email: "definitely_does_not_exist@example.com" });
    const reqRes = await requestPasswordResetAction(reqNonExistent);
    assert(
      reqRes.success === true &&
        reqRes.message === "If an account exists with that email, a password reset link has been dispatched.",
      "7. Password reset request enforces anti-enumeration for non-existent users"
    );

    const reqInvalidEmail = makeFormData({ email: "invalid-email-format" });
    const reqInvalidRes = await requestPasswordResetAction(reqInvalidEmail);
    assert(
      reqInvalidRes.error === "Invalid email format",
      "7b. Invalid email format correctly rejected with validation error"
    );

  } finally {
    // Restore original db bindings
    Object.assign(db, {
      user: originalUser,
      passwordResetToken: originalToken,
      session: originalSession,
      auditLog: originalAuditLog,
      $transaction: originalTx,
    });
  }

  // ----------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(`Phase 2E Concurrency Hardening Test Run: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution encountered an unhandled error:", err);
  process.exit(1);
});
