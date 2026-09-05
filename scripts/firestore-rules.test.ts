// Security-rules check for firestore.rules: the operations
// src/logic/cloudSync.ts performs (list, set, batch delete+set), run
// against the Firestore emulator as the owning user, another user, and
// no user, plus the public pickArchive mirror. Skipped unless
// FIRESTORE_EMULATOR_HOST is set; `npm run test:rules` wraps this in
// `firebase emulators:exec`, which starts the emulator (needs a JDK)
// and sets the variable.

import { readFileSync } from "node:fs";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const rulesFile = new URL("../firestore.rules", import.meta.url);

// The payload cloudSync.writeBlock sends.
const blockPayload = (json: string) => ({ json, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

describe.skipIf(!emulatorHost)("firestore.rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: process.env.GCLOUD_PROJECT ?? "demo-pokedoku",
      firestore: { rules: readFileSync(rulesFile, "utf8") },
    });
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const asAlice = () => testEnv.authenticatedContext("alice").firestore();
  const asBob = () => testEnv.authenticatedContext("bob").firestore();
  const asNobody = () => testEnv.unauthenticatedContext().firestore();
  const seedBlock = (uid: string, deviceId: string) =>
    testEnv.withSecurityRulesDisabled((context) =>
      context.firestore().doc(`users/${uid}/blocks/${deviceId}`).set(blockPayload("{}")),
    );
  const listBlockIdsUnchecked = async (uid: string): Promise<string[]> => {
    let ids: string[] = [];
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.firestore().collection(`users/${uid}/blocks`).get();
      ids = snapshot.docs.map((docSnapshot) => docSnapshot.id);
    });
    return ids;
  };

  describe("users/{uid}/blocks (Google sync)", () => {
    it("lets the owner list their blocks (every sync starts with this read)", async () => {
      await seedBlock("alice", "phone1");
      const snapshot = await assertSucceeds(asAlice().collection("users/alice/blocks").get());
      expect(snapshot.docs.map((docSnapshot) => docSnapshot.id)).toEqual(["phone1"]);
    });

    it("denies reading another user's blocks, signed in or not", async () => {
      await seedBlock("alice", "phone1");
      await assertFails(asBob().collection("users/alice/blocks").get());
      await assertFails(asBob().doc("users/alice/blocks/phone1").get());
      await assertFails(asNobody().collection("users/alice/blocks").get());
    });

    it("lets the owner create and overwrite their device's block", async () => {
      const ownDoc = asAlice().doc("users/alice/blocks/laptop1");
      await assertSucceeds(ownDoc.set(blockPayload('{"deviceId":"laptop1"}')));
      await assertSucceeds(ownDoc.set(blockPayload('{"deviceId":"laptop1","answered":1}')));
    });

    it("denies writes into another user's blocks", async () => {
      await assertFails(asBob().doc("users/alice/blocks/laptop1").set(blockPayload("{}")));
      await assertFails(asNobody().doc("users/alice/blocks/laptop1").set(blockPayload("{}")));
    });

    it("requires json to be a string under the size cap", async () => {
      const ownDoc = asAlice().doc("users/alice/blocks/laptop1");
      await assertFails(ownDoc.set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      await assertFails(ownDoc.set({ json: { deviceId: "laptop1" } }));
      await assertFails(ownDoc.set(blockPayload("x".repeat(900_000))));
      await assertSucceeds(ownDoc.set(blockPayload("x".repeat(899_999))));
    });

    it("lets the owner drop other devices' docs in one batch with their own write (reset-all, absorb)", async () => {
      await seedBlock("alice", "phone1");
      await seedBlock("alice", "tablet1");
      const db = asAlice();
      const batch = db.batch();
      batch.delete(db.doc("users/alice/blocks/phone1"));
      batch.delete(db.doc("users/alice/blocks/tablet1"));
      batch.set(db.doc("users/alice/blocks/laptop1"), blockPayload("{}"));
      await assertSucceeds(batch.commit());
      expect(await listBlockIdsUnchecked("alice")).toEqual(["laptop1"]);
    });

    it("denies a batch that touches another user's doc, even alongside an allowed write", async () => {
      await seedBlock("alice", "phone1");
      const db = asBob();
      const batch = db.batch();
      batch.delete(db.doc("users/alice/blocks/phone1"));
      batch.set(db.doc("users/bob/blocks/laptop1"), blockPayload("{}"));
      await assertFails(batch.commit());
      expect(await listBlockIdsUnchecked("alice")).toEqual(["phone1"]);
    });

    it("denies anything else under the user (default deny)", async () => {
      await assertFails(asAlice().doc("users/alice").set({ theme: "dark" }));
      await assertFails(asAlice().doc("users/alice").get());
      await assertFails(asAlice().doc("users/alice/settings/theme").set({ dark: true }));
    });
  });

  describe("pickArchive (public mirror)", () => {
    it("is readable by anyone and writable by no client", async () => {
      await testEnv.withSecurityRulesDisabled((context) =>
        context.firestore().doc("pickArchive/puzzle1").set({ counts: {} }),
      );
      await assertSucceeds(asNobody().doc("pickArchive/puzzle1").get());
      await assertSucceeds(asNobody().collection("pickArchive").get());
      await assertFails(asAlice().doc("pickArchive/puzzle1").set({ counts: {} }));
      await assertFails(asAlice().doc("pickArchive/puzzle1").delete());
    });
  });
});
