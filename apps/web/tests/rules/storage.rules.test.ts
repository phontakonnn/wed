import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

/**
 * Storage rules under test: storage.rules at the repository root.
 * Requires `firebase emulators:exec` (see `npm run test:rules`).
 */

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';
const TEN_MB = 10 * 1024 * 1024;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pkh-rules',
    storage: {
      rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const storageFor = (uid: string) => env.authenticatedContext(uid).storage();
const anonStorage = () => env.unauthenticatedContext().storage();

describe('storage.rules', () => {
  it('denies uploads when signed out', async () => {
    const storage = anonStorage();
    await assertFails(
      uploadBytes(ref(storage, `users/${OWNER}/attachments/a.png`), new Uint8Array([1, 2, 3]), {
        contentType: 'image/png',
      }),
    );
  });

  it('denies writing into another user\'s folder', async () => {
    const storage = storageFor(STRANGER);
    await assertFails(
      uploadBytes(ref(storage, `users/${OWNER}/attachments/a.png`), new Uint8Array([1, 2, 3]), {
        contentType: 'image/png',
      }),
    );
  });

  it('allows the owner to upload and read an allowed image', async () => {
    const storage = storageFor(OWNER);
    const target = ref(storage, `users/${OWNER}/attachments/photo.png`);
    await assertSucceeds(uploadBytes(target, new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
    await assertSucceeds(getBytes(target));
  });

  it('allows the owner to delete their own object', async () => {
    const storage = storageFor(OWNER);
    const target = ref(storage, `users/${OWNER}/attachments/delete-me.png`);
    await assertSucceeds(uploadBytes(target, new Uint8Array([1]), { contentType: 'image/png' }));
    await assertSucceeds(deleteObject(target));
  });

  it('rejects a disallowed content type', async () => {
    const storage = storageFor(OWNER);
    await assertFails(
      uploadBytes(ref(storage, `users/${OWNER}/attachments/evil.html`), new Uint8Array([1]), {
        contentType: 'text/html',
      }),
    );
  });

  it('rejects an upload above 10 MiB', async () => {
    const storage = storageFor(OWNER);
    await assertFails(
      uploadBytes(ref(storage, `users/${OWNER}/attachments/big.pdf`), new Uint8Array(TEN_MB + 1), {
        contentType: 'application/pdf',
      }),
    );
  });
});
