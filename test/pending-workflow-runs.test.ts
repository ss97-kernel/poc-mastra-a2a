import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  ApprovalExpiredError,
  ApprovalPendingError,
  ApprovalRejectedError,
  GovernanceHaltError,
} from '@openbox-ai/openbox-mastra-sdk';
import {
  extractSuspendedWorkflowStep,
  pendingWorkflowRuns,
  resumePendingWorkflowRun,
  trackPendingWorkflowRun,
} from '../agents/gateway/src/mastra/workflows/pendingWorkflowRuns.js';

describe('pending workflow runs', () => {
  beforeEach(() => {
    pendingWorkflowRuns.clear();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('extracts the first resumable step from suspend payloads', () => {
    expect(
      extractSuspendedWorkflowStep({
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {
            openbox: {
              approvalId: 'approval-1',
            },
          },
        },
      })
    ).toBe('route-to-web-search');
  });

  it('keeps the task waiting when approval is still pending', async () => {
    trackPendingWorkflowRun(
      'task-1',
      {
        resume: async () => {
          throw new ApprovalPendingError('Awaiting approval');
        },
      },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {
            openbox: {
              approvalId: 'approval-1',
            },
          },
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-1')).resolves.toEqual({
      status: 'waiting',
      message: 'Awaiting approval in OpenBox',
      suspendPayload: {
        'route-to-web-search': {
          openbox: {
            approvalId: 'approval-1',
          },
        },
      },
    });
  });

  it('backs off resume attempts while approval is still pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T00:00:00.000Z'));
    vi.stubEnv('OPENBOX_APPROVAL_RESUME_POLL_INTERVAL_MS', '5000');
    const resume = vi.fn(async () => {
      throw new ApprovalPendingError('Awaiting approval');
    });

    trackPendingWorkflowRun(
      'task-backoff',
      { resume },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {
            openbox: {
              approvalId: 'approval-1',
            },
          },
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-backoff')).resolves.toEqual({
      status: 'waiting',
      message: 'Awaiting approval in OpenBox',
      suspendPayload: {
        'route-to-web-search': {
          openbox: {
            approvalId: 'approval-1',
          },
        },
      },
    });
    expect(resume).toHaveBeenCalledTimes(1);

    await expect(resumePendingWorkflowRun('task-backoff')).resolves.toEqual({
      status: 'waiting',
      message: 'Awaiting approval in OpenBox',
      suspendPayload: {
        'route-to-web-search': {
          openbox: {
            approvalId: 'approval-1',
          },
        },
      },
    });
    expect(resume).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-04-03T00:00:06.000Z'));

    await expect(resumePendingWorkflowRun('task-backoff')).resolves.toEqual({
      status: 'waiting',
      message: 'Awaiting approval in OpenBox',
      suspendPayload: {
        'route-to-web-search': {
          openbox: {
            approvalId: 'approval-1',
          },
        },
      },
    });
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('returns completed when the resumed workflow succeeds', async () => {
    trackPendingWorkflowRun(
      'task-2',
      {
        resume: async () => ({
          status: 'success',
          result: {
            ok: true,
          },
        }),
      },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {},
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-2')).resolves.toEqual({
      status: 'completed',
      result: {
        ok: true,
      },
    });
    expect(pendingWorkflowRuns.has('task-2')).toBe(false);
  });

  it('fails the task when approval is explicitly rejected', async () => {
    trackPendingWorkflowRun(
      'task-3',
      {
        resume: async () => {
          throw new ApprovalRejectedError('Activity rejected: denied by policy');
        },
      },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {},
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-3')).resolves.toEqual({
      status: 'failed',
      message: 'Activity rejected: denied by policy',
    });
    expect(pendingWorkflowRuns.has('task-3')).toBe(false);
  });

  it('fails the task when approval expires', async () => {
    trackPendingWorkflowRun(
      'task-4',
      {
        resume: async () => {
          throw new ApprovalExpiredError('Approval expired before operator action');
        },
      },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {},
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-4')).resolves.toEqual({
      status: 'failed',
      message: 'Approval expired before operator action',
    });
    expect(pendingWorkflowRuns.has('task-4')).toBe(false);
  });

  it('fails the task when governance halts execution', async () => {
    trackPendingWorkflowRun(
      'task-5',
      {
        resume: async () => {
          throw new GovernanceHaltError('Execution halted by governance policy');
        },
      },
      {
        status: 'suspended',
        suspendPayload: {
          'route-to-web-search': {},
        },
      }
    );

    await expect(resumePendingWorkflowRun('task-5')).resolves.toEqual({
      status: 'failed',
      message: 'Execution halted by governance policy',
    });
    expect(pendingWorkflowRuns.has('task-5')).toBe(false);
  });
});
