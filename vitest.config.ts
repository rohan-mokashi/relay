import { defineConfig } from "vitest/config";

const shared = {
  environment: "node" as const,
  // PGlite and stdio process tests both allocate native child workers. Serial files keep the
  // clean-checkout verifier deterministic on resource-constrained Windows hosts.
  fileParallelism: false,
  testTimeout: 20_000,
  hookTimeout: 20_000,
  isolate: true,
};

export default defineConfig({
  test: {
    ...shared,
    projects: [
      {
        test: {
          ...shared,
          name: "unit",
          include: ["packages/**/tests/**/*.unit.test.ts", "apps/**/tests/**/*.unit.test.ts"],
        },
      },
      {
        test: {
          ...shared,
          name: "integration",
          include: ["packages/**/tests/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          ...shared,
          name: "contract",
          include: ["apps/**/tests/**/*.contract.test.ts"],
        },
      },
      {
        test: {
          ...shared,
          name: "security",
          include: ["apps/**/tests/**/*.security.test.ts"],
        },
      },
      {
        test: {
          ...shared,
          name: "e2e",
          include: ["apps/**/tests/**/*.e2e.test.ts"],
        },
      },
    ],
  },
});
