import { applyPhaseToUsephase } from './apply.js';
import { phaseToUsephaseCommand } from './command.js';
import {
  InvalidTargetError,
  type PlannedFileChange,
  planPhaseToUsephase,
} from './plan.js';

vi.mock('./apply.js', () => ({
  applyPhaseToUsephase: vi.fn(),
}));
vi.mock('./plan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plan.js')>();
  return { ...actual, planPhaseToUsephase: vi.fn() };
});

const change = (displayPath: string): PlannedFileChange => ({
  after: 'after',
  before: 'before',
  displayPath,
  filePath: `/workspace/${displayPath}`,
  parentDirectoryIdentity: { device: 1, inode: 2, realPath: '/workspace' },
});
const firstChange = change('a.ts');
const secondChange = change('b.ts');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('phase-to-usephase command', () => {
  it('returns the planned files without applying changes during a dry run', () => {
    vi.mocked(planPhaseToUsephase).mockReturnValue({
      changes: [firstChange, secondChange],
    });

    const result = phaseToUsephaseCommand.execute({
      cwd: '/workspace',
      target: '.',
      isDryRun: true,
    });

    expect(result).toEqual({
      kind: 'succeeded',
      changedFiles: ['a.ts', 'b.ts'],
    });
    expect(applyPhaseToUsephase).not.toHaveBeenCalled();
  });

  it('distinguishes an invalid target from a migration failure', () => {
    vi.mocked(planPhaseToUsephase).mockImplementation(() => {
      throw new InvalidTargetError('Target does not exist: missing.ts');
    });

    expect(
      phaseToUsephaseCommand.execute({
        cwd: '/workspace',
        target: 'missing.ts',
        isDryRun: false,
      }),
    ).toEqual({
      kind: 'invalid-target',
      message: 'Target does not exist: missing.ts',
    });
  });

  it('maps an apply failure to its applied prefix and marks it retryable', () => {
    vi.mocked(planPhaseToUsephase).mockReturnValue({
      changes: [firstChange, secondChange],
    });
    vi.mocked(applyPhaseToUsephase).mockReturnValue({
      kind: 'failed',
      stage: 'apply',
      failedChange: secondChange,
      appliedChanges: [firstChange],
      cause: new Error('permission denied'),
    });

    expect(
      phaseToUsephaseCommand.execute({
        cwd: '/workspace',
        target: '.',
        isDryRun: false,
      }),
    ).toEqual({
      kind: 'failed',
      message: 'Failed to apply change to b.ts: permission denied',
      appliedFiles: ['a.ts'],
      canRetry: true,
    });
  });

  it('preserves the cleanup failure distinction', () => {
    vi.mocked(planPhaseToUsephase).mockReturnValue({ changes: [firstChange] });
    vi.mocked(applyPhaseToUsephase).mockReturnValue({
      kind: 'failed',
      stage: 'cleanup',
      failedChange: firstChange,
      appliedChanges: [firstChange],
      cause: new Error('directory is not empty'),
    });

    expect(
      phaseToUsephaseCommand.execute({
        cwd: '/workspace',
        target: '.',
        isDryRun: false,
      }),
    ).toEqual({
      kind: 'failed',
      message:
        'Changed a.ts, but failed to remove its temporary directory: directory is not empty',
      appliedFiles: ['a.ts'],
      canRetry: true,
    });
  });
});
