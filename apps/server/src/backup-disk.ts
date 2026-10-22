/**
 * Read-only physical disk mapping for backup preflight.
 *
 * Windows is the only platform where this can currently prove anything: it asks the partition
 * service which disk number owns a drive letter. Everything else returns UNKNOWN rather than
 * guessing. No file content is read and nothing is created or changed.
 */
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { parse, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DiskMappingMethod =
  | 'windows-partition'
  | 'windows-cim'
  | 'unc'
  | 'device-id'
  | 'unsupported-platform'
  | 'unavailable';

export interface DiskMapping {
  path: string;
  /** Drive letter such as `C:` when the path is on a drive-letter volume. */
  volume: string | null;
  /** `Disk 0`, `Disk 1`, … only when Windows partition data proves it. */
  physicalDisk: string | null;
  method: DiskMappingMethod;
  reason?: string;
}

export interface DiskProbeOptions {
  platform?: NodeJS.Platform;
  /** Injected in tests so no real machine query ever runs. */
  runPowerShell?: (script: string) => Promise<string>;
}

export interface DiskComparison {
  data: DiskMapping;
  backup: DiskMapping;
  /** true = proven same disk, false = proven different disks, null = cannot prove either. */
  sameDisk: boolean | null;
  evidence: string[];
}

async function defaultRunner(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 8000, windowsHide: true },
  );
  return stdout;
}

function driveLetter(path: string): string | null {
  const root = parse(resolve(path)).root;
  const match = /^([A-Za-z]):[\\/]$/.exec(root);
  return match ? `${match[1].toUpperCase()}:` : null;
}

/**
 * Map one path to its physical disk where the platform allows it.
 *
 * UNC/network paths and paths that do not sit on a drive-letter volume deliberately return
 * `physicalDisk: null`; reporting a guess here would defeat the purpose of the gate.
 */
export async function mapPathToPhysicalDisk(
  path: string,
  options: DiskProbeOptions = {},
): Promise<DiskMapping> {
  const resolved = resolve(path);
  const platform = options.platform ?? process.platform;

  if (resolved.startsWith('\\\\') || resolved.startsWith('//')) {
    return {
      path: resolved,
      volume: null,
      physicalDisk: null,
      method: 'unc',
      reason: 'network path; physical disk cannot be proven from this host',
    };
  }

  if (platform !== 'win32') {
    return {
      path: resolved,
      volume: driveLetter(resolved),
      physicalDisk: null,
      method: 'unsupported-platform',
      reason: `physical disk mapping is not implemented for ${platform}`,
    };
  }

  const volume = driveLetter(resolved);
  if (!volume) {
    let device: string | null = null;
    try {
      device = String(statSync(resolved).dev);
    } catch {
      device = null;
    }
    return {
      path: resolved,
      volume: null,
      physicalDisk: null,
      method: 'device-id',
      reason: device
        ? `no drive letter (mount point or device ${device}); physical disk unknown`
        : 'no drive letter and the path is not readable; physical disk unknown',
    };
  }

  const letter = volume[0];
  // Two read-only strategies: the Storage cmdlets, then the WMI association map for hosts where
  // Get-Partition/Get-Volume cannot see the volume. The letter is validated above, so it is safe
  // to interpolate.
  // The whole script travels as one `-Command` argument. On Windows, Node quotes that argument and
  // PowerShell re-parses it, which strips embedded double quotes: `Write-Output ($src + ":" + $n)`
  // arrives as `($src + : + $n)` and the script fails to parse, so the fallback silently returned
  // nothing. This script therefore uses single quotes only and compares the association through the
  // typed `DeviceID` property instead of a quoted regex. `backup-disk.test.ts` guards that rule.
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$letter = '${letter}'`,
    '$n = $null',
    '$src = $null',
    "try { $n = (Get-Partition -DriveLetter $letter -ErrorAction Stop | Select-Object -First 1 -ExpandProperty DiskNumber); $src = 'partition' } catch { $n = $null }",
    'if ($null -eq $n) {',
    '  try {',
    "    $m = Get-CimInstance Win32_LogicalDiskToPartition -ErrorAction Stop | Where-Object { $_.Dependent.DeviceID -eq ($letter + ':') } | Select-Object -First 1",
    "    if ($m) { $text = [string]$m.Antecedent; if ($text -match 'Disk #(\\d+)') { $n = [int]$matches[1]; $src = 'cim' } }",
    '  } catch { $n = $null }',
    '}',
    "if ($null -ne $n) { Write-Output ($src + ':' + $n) }",
  ].join('; ');
  try {
    const output = await (options.runPowerShell ?? defaultRunner)(script);
    const match = /^\s*(?:(partition|cim):)?(\d+)\s*$/m.exec(output);
    if (!match) {
      return {
        path: resolved,
        volume,
        physicalDisk: null,
        method: 'unavailable',
        reason: 'partition service returned no disk number',
      };
    }
    return {
      path: resolved,
      volume,
      physicalDisk: `Disk ${match[2]}`,
      method: match[1] === 'cim' ? 'windows-cim' : 'windows-partition',
    };
  } catch {
    return {
      path: resolved,
      volume,
      physicalDisk: null,
      method: 'unavailable',
      reason: 'partition query failed (permission or service unavailable)',
    };
  }
}

export async function comparePhysicalDisks(
  dataPath: string,
  backupPath: string,
  options: DiskProbeOptions = {},
): Promise<DiskComparison> {
  const data = await mapPathToPhysicalDisk(dataPath, options);
  const backup = await mapPathToPhysicalDisk(backupPath, options);
  const evidence: string[] = [];

  let sameDisk: boolean | null = null;
  if (data.physicalDisk && backup.physicalDisk) {
    sameDisk = data.physicalDisk === backup.physicalDisk;
    evidence.push(
      `${data.path} -> ${data.volume ?? '?'} (${data.physicalDisk}); ` +
      `${backup.path} -> ${backup.volume ?? '?'} (${backup.physicalDisk})`,
    );
  } else {
    evidence.push(
      `DATA_DIR: ${data.reason ?? 'unknown'}; BACKUP_DIR: ${backup.reason ?? 'unknown'}`,
    );
  }

  return { data, backup, sameDisk, evidence };
}
