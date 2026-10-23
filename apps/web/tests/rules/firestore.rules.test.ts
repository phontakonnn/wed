import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/**
 * Runs against the Firestore emulator (`npm run test:rules`), never against a
 * real project: `initializeTestEnvironment` refuses to talk to production.
 *
 * Rules under test: firestore.rules at the repository root.
 */

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pkh-rules',
    firestore: {
      rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const ownerDb = () => env.authenticatedContext(OWNER).firestore();
const strangerDb = () => env.authenticatedContext(STRANGER).firestore();
const anonymousDb = () => env.unauthenticatedContext().firestore();

describe('firestore.rules — authentication', () => {
  it('denies reads and writes when signed out', async () => {
    const db = anonymousDb();
    await assertFails(getDocs(collection(db, 'users', OWNER, 'notes')));
    await assertFails(setDoc(doc(db, 'users', OWNER, 'notes', 'n1'), { title: 'x' }));
  });

  it('denies reading or writing another user\'s subtree', async () => {
    const db = strangerDb();
    await assertFails(setDoc(doc(db, 'users', OWNER, 'notes', 'n1'), { title: 'x' }));
    await assertFails(getDoc(doc(db, 'users', OWNER, 'notes', 'n1')));
    await assertFails(deleteDoc(doc(db, 'users', OWNER, 'notes', 'n1')));
  });

  it('denies collections outside the users/ tree', async () => {
    const db = ownerDb();
    await assertFails(setDoc(doc(db, 'publicFeed', 'x'), { title: 'x' }));
    await assertFails(getDocs(collection(db, 'publicFeed')));
  });
});

describe('firestore.rules — owner access', () => {
  it('allows the owner to create, read, update and delete a note', async () => {
    const db = ownerDb();
    const ref = doc(db, 'users', OWNER, 'notes', 'n1');
    await assertSucceeds(setDoc(ref, { title: 'สวัสดี', content: 'body', createdAt: 1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { title: 'แก้ไข' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('allows the owner to read their own profile document', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, 'users', OWNER), { displayName: 'Owner' }));
    await assertSucceeds(getDoc(doc(db, 'users', OWNER)));
  });

  it('never allows deleting the profile document', async () => {
    const db = ownerDb();
    await assertSucceeds(setDoc(doc(db, 'users', OWNER), { displayName: 'Owner' }));
    await assertFails(deleteDoc(doc(db, 'users', OWNER)));
  });
});

describe('firestore.rules — payload validation', () => {
  const write = (data: Record<string, unknown>) =>
    setDoc(doc(ownerDb(), 'users', OWNER, 'notes', 'n1'), data);

  it('rejects a title longer than 300 characters', async () => {
    await assertFails(write({ title: 'ก'.repeat(301) }));
  });

  it('accepts a title at the limit', async () => {
    await assertSucceeds(write({ title: 'ก'.repeat(300) }));
  });

  it('rejects a title of the wrong type', async () => {
    await assertFails(write({ title: 123 }));
  });

  it('rejects content above 500000 characters', async () => {
    await assertFails(write({ content: 'x'.repeat(500001) }));
  });

  it('rejects taxonomy arrays above 50 entries', async () => {
    await assertFails(write({ tagIds: Array.from({ length: 51 }, (_, i) => `t${i}`) }));
    await assertFails(write({ categoryIds: Array.from({ length: 51 }, (_, i) => `c${i}`) }));
    await assertFails(write({ personIds: Array.from({ length: 51 }, (_, i) => `p${i}`) }));
  });

  it('rejects a taxonomy field that is not a list', async () => {
    await assertFails(write({ tagIds: 'not-a-list' }));
  });

  it('rejects documents with more than 60 fields', async () => {
    const wide: Record<string, unknown> = { title: 'ok' };
    for (let i = 0; i < 60; i++) wide[`field${i}`] = i;
    await assertFails(write(wide));
  });

  it('rejects a name longer than 120 characters', async () => {
    await assertFails(write({ name: 'n'.repeat(121) }));
  });
});
