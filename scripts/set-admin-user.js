console.error(
  "This legacy admin utility has been disabled because it used a hardcoded password. " +
    "Use `npm run auth:bootstrap -- --execute` for a one-time superadmin bootstrap."
);
process.exitCode = 1;
