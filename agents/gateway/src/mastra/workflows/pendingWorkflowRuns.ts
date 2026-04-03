import {
  ApprovalExpiredError,
  ApprovalPendingError,
  ApprovalRejectedError,
  GovernanceHaltError,
} from '@openbox-ai/openbox-mastra-sdk';

type ResumableWorkflowRun = {
  resume: (args: {
    resumeData?: unknown;
    step?: string;
  }) => Promise<unknown>;
  runId?: string;
};

type SuspendedWorkflowResult = {
  status: 'suspended';
  suspendPayload?: unknown;
};

type SuccessfulWorkflowResult = {
  status: 'success';
  result: unknown;
};

type FailedWorkflowResult = {
  status: string;
  error?: unknown;
};

export type PendingWorkflowRun = {
  run: ResumableWorkflowRun;
  step?: string;
  suspendPayload?: unknown;
  nextResumeAttemptAt: number;
};

export const pendingWorkflowRuns = new Map<string, PendingWorkflowRun>();

function getResumePollIntervalMs() {
  const configured = Number.parseInt(
    process.env.OPENBOX_APPROVAL_RESUME_POLL_INTERVAL_MS || '5000',
    10
  );

  return Number.isFinite(configured) && configured >= 0 ? configured : 5000;
}

function isSuspendedWorkflowResult(
  result: unknown
): result is SuspendedWorkflowResult {
  return (
    result !== null &&
    typeof result === 'object' &&
    'status' in result &&
    (result as { status?: unknown }).status === 'suspended'
  );
}

function isSuccessfulWorkflowResult(
  result: unknown
): result is SuccessfulWorkflowResult {
  return (
    result !== null &&
    typeof result === 'object' &&
    'status' in result &&
    (result as { status?: unknown }).status === 'success' &&
    'result' in result
  );
}

function getWorkflowStatus(result: unknown) {
  if (result !== null && typeof result === 'object' && 'status' in result) {
    return String((result as FailedWorkflowResult).status);
  }

  return 'failed';
}

export function extractSuspendedWorkflowStep(
  result: SuspendedWorkflowResult
): string | undefined {
  const payload = result.suspendPayload;

  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const [firstStep] = Object.keys(payload as Record<string, unknown>);
  return firstStep;
}

export function trackPendingWorkflowRun(
  taskId: string,
  run: ResumableWorkflowRun,
  result: SuspendedWorkflowResult
) {
  pendingWorkflowRuns.set(taskId, {
    run,
    step: extractSuspendedWorkflowStep(result),
    suspendPayload: result.suspendPayload,
    nextResumeAttemptAt: 0,
  });
}

function buildResumeArgs(step: string | undefined) {
  return {
    resumeData: {
      approved: true,
      approvedBy: 'openbox-ui',
    },
    ...(step ? { step } : {}),
  };
}

function buildGovernanceFailure(error: unknown): {
  message: string;
  terminal: boolean;
} {
  if (error instanceof ApprovalPendingError) {
    return {
      message: 'Awaiting approval in OpenBox',
      terminal: false,
    };
  }

  if (error instanceof ApprovalRejectedError) {
    return {
      message: error.message,
      terminal: true,
    };
  }

  if (error instanceof ApprovalExpiredError) {
    return {
      message: error.message,
      terminal: true,
    };
  }

  if (error instanceof GovernanceHaltError) {
    return {
      message: error.message,
      terminal: true,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      terminal: true,
    };
  }

  return {
    message: 'Unknown workflow error',
    terminal: true,
  };
}

export async function resumePendingWorkflowRun(taskId: string): Promise<
  | { status: 'waiting'; message: string; suspendPayload?: unknown }
  | { status: 'completed'; result: unknown }
  | { status: 'failed'; message: string }
> {
  const pendingRun = pendingWorkflowRuns.get(taskId);
  if (!pendingRun) {
    return {
      status: 'failed',
      message: `Pending workflow run ${taskId} not found`,
    };
  }

  if (Date.now() < pendingRun.nextResumeAttemptAt) {
    return {
      status: 'waiting',
      message: 'Awaiting approval in OpenBox',
      suspendPayload: pendingRun.suspendPayload,
    };
  }

  pendingRun.nextResumeAttemptAt = Date.now() + getResumePollIntervalMs();

  try {
    const resumed = await pendingRun.run.resume(buildResumeArgs(pendingRun.step));

    if (isSuspendedWorkflowResult(resumed)) {
      trackPendingWorkflowRun(taskId, pendingRun.run, resumed);
      const refreshed = pendingWorkflowRuns.get(taskId);
      if (refreshed) {
        refreshed.nextResumeAttemptAt = Date.now() + getResumePollIntervalMs();
      }
      return {
        status: 'waiting',
        message: 'Awaiting approval in OpenBox',
        suspendPayload: resumed.suspendPayload,
      };
    }

    if (isSuccessfulWorkflowResult(resumed)) {
      pendingWorkflowRuns.delete(taskId);
      return {
        status: 'completed',
        result: resumed.result,
      };
    }

    pendingWorkflowRuns.delete(taskId);
    return {
      status: 'failed',
      message: `Workflow failed with status ${getWorkflowStatus(resumed)}`,
    };
  } catch (error) {
    const failure = buildGovernanceFailure(error);

    if (failure.terminal) {
      pendingWorkflowRuns.delete(taskId);
      return {
        status: 'failed',
        message: failure.message,
      };
    }

    pendingRun.nextResumeAttemptAt = Date.now() + getResumePollIntervalMs();

    return {
      status: 'waiting',
      message: failure.message,
      suspendPayload: pendingRun.suspendPayload,
    };
  }
}
