import io

p = 'docs/ACCEPTANCE.md'
lines = io.open(p, encoding='utf-8').read().split('\n')

start = next(i for i, line in enumerate(lines) if line.strip() == '### 7.6 Recording')
header = next(i for i in range(start, start + 10) if lines[i].startswith('| Gate | Date |'))
sep = header + 1
first_row = sep + 1

short = [
    "| BK-08 | 2026-10-21 | **PASS** — `C:` Disk 0 vs `D:` Disk 1, `DIFFERENT PHYSICAL DISKS` | "
    "`.tmp-acceptance-20261020/bk-evidence/bk08-preflight.txt`, `bk08-disk-inventory.txt` |",
    "| BK-09 | 2026-10-21 | **PARTIAL** — registered + 1 triggered run (`LastTaskResult=0`), verified "
    "backup; 2 more consecutive days needed | `bk09-scheduled-task.txt`, `bk09-backup-list.log`, "
    "`pkh-task-export.xml` |",
    "| BK-10 | 2026-10-21 | **PASS** — isolated recovery target, object loss + restore, SHA-256 match, "
    "`storage:check` clean | `bk10-restore-drill.txt`, `bk10-restore-1.log`, `bk10-restore-2.log`, "
    "`bk10-restored-state*.json` |",
    "| BK-11b | 2026-10-21 | **PARTIAL** — key store, rotation and encrypted target proven; offline "
    "escrow copy outstanding | `bk11b-rotation.txt`, `bk11b-backup-1.log`, `bk11b-backup-2.log` |",
]

# The four gate rows were overwritten with full-table rows; replace them in place.
count = 0
for i in range(first_row, first_row + 4):
    if lines[i].startswith('| BK-'):
        lines[i] = short[count]
        count += 1

assert count == 4, f'expected 4 rows, replaced {count}'
io.open(p, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
print('7.6 rows normalised')
