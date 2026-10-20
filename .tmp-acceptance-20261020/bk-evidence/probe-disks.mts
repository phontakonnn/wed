// Read-only BK-08 disk probe evidence. Never writes to DATA_DIR/BACKUP_DIR.
import { mapPathToPhysicalDisk } from '../../apps/server/src/backup-disk.js';

const paths = process.argv.slice(2);
for (const path of paths) {
  const mapping = await mapPathToPhysicalDisk(path);
  console.log(JSON.stringify(mapping));
}
