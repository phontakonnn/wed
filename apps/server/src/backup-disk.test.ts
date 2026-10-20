import { describe, expect, it } from 'vitest';
import { comparePhysicalDisks, mapPathToPhysicalDisk } from './backup-disk.js';

const windows = { platform: 'win32' as const };

describe('physical disk mapping', () => {
  it('maps a drive letter through the partition service', async () => {
    const calls: string[] = [];
    const mapping = await mapPathToPhysicalDisk('C:\\PKH-data', {
      ...windows,
      runPowerShell: async (script) => {
        calls.push(script);
        return '0\n';
      },
    });

    expect(mapping).toMatchObject({
      volume: 'C:',
      physicalDisk: 'Disk 0',
      method: 'windows-partition',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("$letter = 'C'");
    expect(calls[0]).toContain('Get-Partition -DriveLetter $letter');
    expect(calls[0]).toContain('Win32_LogicalDiskToPartition');
    expect(calls[0]).toContain('DiskNumber');
  });

  it('accepts the WMI fallback result and records which method proved it', async () => {
    const mapping = await mapPathToPhysicalDisk('C:////data', {
      ...windows,
      runPowerShell: async () => 'cim:1\n',
    });
    expect(mapping).toMatchObject({ physicalDisk: 'Disk 1', method: 'windows-cim' });
  });

  it('handles lower-case drive letters and paths with spaces', async () => {
    const mapping = await mapPathToPhysicalDisk('d:\\PKH Backup\\nightly', {
      ...windows,
      runPowerShell: async () => '2',
    });
    expect(mapping.volume).toBe('D:');
    expect(mapping.physicalDisk).toBe('Disk 2');
  });

  it('maps a mount point on a drive-letter volume', async () => {
    const mapping = await mapPathToPhysicalDisk('C:\\Mount\\Backup', {
      ...windows,
      runPowerShell: async () => '1',
    });
    expect(mapping.volume).toBe('C:');
    expect(mapping.physicalDisk).toBe('Disk 1');
  });

  it('refuses to guess for UNC and network paths', async () => {
    let called = false;
    const mapping = await mapPathToPhysicalDisk('\\\\server\\share\\backups', {
      ...windows,
      runPowerShell: async () => {
        called = true;
        return '0';
      },
    });
    expect(called).toBe(false);
    expect(mapping).toMatchObject({ method: 'unc', physicalDisk: null, volume: null });
    expect(mapping.reason).toMatch(/network path/);
  });

  it('reports unsupported platforms instead of assuming separation', async () => {
    const mapping = await mapPathToPhysicalDisk('/srv/pkh', {
      platform: 'linux',
      runPowerShell: async () => '0',
    });
    expect(mapping).toMatchObject({ method: 'unsupported-platform', physicalDisk: null });
    expect(mapping.reason).toMatch(/not implemented/);
  });

  it('reports unavailable when the partition query fails or returns nothing useful', async () => {
    const failed = await mapPathToPhysicalDisk('C:\\data', {
      ...windows,
      runPowerShell: async () => {
        throw new Error('access denied');
      },
    });
    expect(failed).toMatchObject({ method: 'unavailable', physicalDisk: null });
    expect(failed.reason).toMatch(/permission|service/);

    const empty = await mapPathToPhysicalDisk('C:\\data', {
      ...windows,
      runPowerShell: async () => 'No partition found',
    });
    expect(empty).toMatchObject({ method: 'unavailable', physicalDisk: null });
    expect(empty.reason).toMatch(/no disk number/);
  });
});

describe('physical disk comparison', () => {
  it('proves the same disk', async () => {
    const comparison = await comparePhysicalDisks('C:\\data', 'C:\\backups', {
      ...windows,
      runPowerShell: async () => '0',
    });
    expect(comparison.sameDisk).toBe(true);
    expect(comparison.evidence.join(' ')).toMatch(/Disk 0/);
  });

  it('proves different disks', async () => {
    const outputs = ['0', '1'];
    const comparison = await comparePhysicalDisks('C:\\data', 'E:\\backups', {
      ...windows,
      runPowerShell: async () => outputs.shift() ?? '1',
    });
    expect(comparison.sameDisk).toBe(false);
    expect(comparison.data.physicalDisk).toBe('Disk 0');
    expect(comparison.backup.physicalDisk).toBe('Disk 1');
  });

  it('returns unknown when either side cannot be mapped', async () => {
    const comparison = await comparePhysicalDisks('C:\\data', '\\\\server\\share', {
      ...windows,
      runPowerShell: async () => '0',
    });
    expect(comparison.sameDisk).toBeNull();
    expect(comparison.backup.method).toBe('unc');
    expect(comparison.evidence.join(' ')).toMatch(/network path/);
  });

  it('returns unknown on unsupported platforms', async () => {
    const comparison = await comparePhysicalDisks('/srv/data', '/mnt/backups', {
      platform: 'linux',
      runPowerShell: async () => '0',
    });
    expect(comparison.sameDisk).toBeNull();
    expect(comparison.data.method).toBe('unsupported-platform');
    expect(comparison.backup.method).toBe('unsupported-platform');
  });

  // Node passes the script as one `-Command` argument and PowerShell re-parses it, stripping any
  // embedded double quote. A script containing `"` silently fails to parse, which made every real
  // Windows probe return UNKNOWN while the unit tests (which inject a runner) stayed green.
  it('never embeds a double quote in the generated PowerShell script', async () => {
    const calls: string[] = [];
    await mapPathToPhysicalDisk('D:\\PKH-Backups', {
      ...windows,
      runPowerShell: async (script) => {
        calls.push(script);
        return 'cim:1\n';
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('"');
    expect(calls[0]).toContain('$_.Dependent.DeviceID -eq ($letter + \':\')');
  });
});
