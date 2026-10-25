// Fixed, non-secret values so modules that read the environment work in tests.
process.env.MULLWELL_SECRET ??= "test-secret-0123456789abcdef";
