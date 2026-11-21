console.error(
  "This legacy cleaner was disabled because it deleted business data. " +
    "Use the reviewed auth-only tool `npm run auth:cleanup` with explicit account emails."
);
process.exitCode = 1;
