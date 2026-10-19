import { StringDecoder } from 'node:string_decoder';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { bootstrapUser } from './auth.js';
import { openDataDatabase } from './database.js';

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run admin bootstrap from an interactive local terminal'));
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  const decoder = new StringDecoder('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003') {
          finish(new Error('Bootstrap cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = [...value].slice(0, -1).join('');
        } else {
          value += character;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const dataDirectory = process.env.DATA_DIR;
  if (!dataDirectory) throw new Error('DATA_DIR must be configured before bootstrapping an administrator');

  const prompt = createInterface({ input: stdin, output: stdout });
  const username = await prompt.question('Administrator username: ');
  prompt.close();

  const password = await readHidden('Administrator password (hidden): ');
  const confirmation = await readHidden('Confirm password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords do not match');

  const database = openDataDatabase(dataDirectory);
  try {
    await bootstrapUser(database, username, password);
    stdout.write('Administrator account created.\n');
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Administrator bootstrap failed');
  process.exitCode = 1;
});
