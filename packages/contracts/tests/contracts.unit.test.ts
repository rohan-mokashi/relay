import { describe, expect, it } from "vitest";
import {
  ArtifactDefinitionSchema,
  CheckpointStatusSchema,
  CreateCheckpointInputSchema,
  CreateHandoffInputSchema,
  HandoffSourceSchema,
  LIMITS,
  UpsertProjectInputSchema,
} from "../src/index.js";
import { RelayError, assertNoObviousSecrets, normalizeSlug } from "../../domain/src/index.js";
import {
  checkpointInput,
  createTestSystem,
  handoffInput,
  principalA,
  projectInput,
} from "../../test-support/src/index.js";

describe("Relay contracts", () => {
  it("normalizes user-friendly slugs deterministically", () => {
    expect(normalizeSlug("  Relay_Bootstrap.v0  ")).toBe("relay-bootstrap-v0");
    expect(normalizeSlug("RELAY---bootstrap")).toBe("relay-bootstrap");
  });

  it("requires handoff acceptance criteria and enforces text limits", () => {
    const valid = handoffInput("prj_00000000-0000-4000-8000-000000000001");
    expect(CreateHandoffInputSchema.safeParse(valid).success).toBe(true);
    expect(CreateHandoffInputSchema.safeParse({ ...valid, acceptance_criteria: [] }).success).toBe(
      false,
    );
    expect(
      CreateHandoffInputSchema.safeParse({ ...valid, summary: "x".repeat(LIMITS.summary + 1) })
        .success,
    ).toBe(false);
    expect(
      CreateHandoffInputSchema.safeParse({
        ...valid,
        constraints: Array.from({ length: LIMITS.arrayItems + 1 }, () => "bounded"),
      }).success,
    ).toBe(false);
  });

  it("limits handoff source URLs to HTTP(S)", () => {
    expect(
      HandoffSourceSchema.safeParse({
        surface: "chatgpt_work",
        conversation_url: "https://chatgpt.com/c/relay-bootstrap",
      }).success,
    ).toBe(true);
    expect(
      HandoffSourceSchema.safeParse({
        surface: "chatgpt_work",
        conversation_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      HandoffSourceSchema.safeParse({
        surface: "chatgpt_work",
        conversation_url: "file:///private/chat.txt",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown mutation fields", () => {
    const result = UpsertProjectInputSchema.safeParse({
      ...projectInput(),
      user_id: "spoofed-principal",
    });
    expect(result.success).toBe(false);
  });

  it("validates checkpoint statuses and passed verification evidence", () => {
    expect(CheckpointStatusSchema.safeParse("finished").success).toBe(false);
    const valid = checkpointInput("prj_00000000-0000-4000-8000-000000000001");
    const verification = valid.verification?.[0];
    expect(verification).toBeDefined();
    const invalid = {
      ...valid,
      verification: [{ ...verification, command: "" }],
    };
    expect(CreateCheckpointInputSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts safe repository artifacts and rejects traversal", () => {
    expect(
      ArtifactDefinitionSchema.safeParse({
        kind: "repo_path",
        label: "MVP",
        uri: "repo://docs/mvp.md",
      }).success,
    ).toBe(true);
    expect(
      ArtifactDefinitionSchema.safeParse({
        kind: "repo_path",
        label: "Outside",
        uri: "repo://../secrets.txt",
      }).success,
    ).toBe(false);
  });

  it("rejects obvious credentials without echoing them in the error", () => {
    const credential = `sk-${"a".repeat(32)}`;
    try {
      assertNoObviousSecrets({ summary: credential });
      throw new Error("expected credential rejection");
    } catch (caught) {
      expect(caught).toBeInstanceOf(RelayError);
      expect((caught as Error).message).not.toContain(credential);
    }
  });

  it("rejects a credential-shaped idempotency key before persistence", async () => {
    const system = createTestSystem();
    const credential = `sk-${"b".repeat(32)}`;
    try {
      await expect(
        system.service.upsertProject(principalA, projectInput({ idempotency_key: credential })),
      ).rejects.toThrowError(RelayError);
      expect(system.repository.countRowsForTesting("projects")).toBe(0);
      expect(system.repository.countRowsForTesting("idempotency_keys")).toBe(0);
    } finally {
      system.dispose();
    }
  });
});
