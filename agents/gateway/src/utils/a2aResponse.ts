type A2AMessagePart = {
  text?: string;
};

type A2AStatusMessage = {
  parts?: A2AMessagePart[];
};

type A2ATaskArtifact = {
  type?: string;
  data?: unknown;
  metadata?: unknown;
};

type A2AObjectResponse = {
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
  task?: {
    artifacts?: A2ATaskArtifact[];
    status?: {
      state?: string;
      message?: A2AStatusMessage;
    };
  };
  message?: A2AStatusMessage;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getFirstText(parts?: A2AMessagePart[]): string | undefined {
  return parts?.find(part => typeof part?.text === 'string')?.text;
}

export function getA2AErrorMessage(response: unknown): string | null {
  if (!isObject(response)) {
    return null;
  }

  const typedResponse = response as A2AObjectResponse;

  if (typedResponse.error?.message) {
    return typedResponse.error.message;
  }

  if (typedResponse.task?.status?.state === 'failed') {
    return (
      getFirstText(typedResponse.task.status.message?.parts) ||
      'A2A task failed'
    );
  }

  return null;
}

export function assertA2ASuccess(response: unknown): void {
  const errorMessage = getA2AErrorMessage(response);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

export function extractA2AResult(response: unknown): unknown {
  if (typeof response === 'string') {
    return response;
  }

  if (!isObject(response)) {
    return response;
  }

  const typedResponse = response as A2AObjectResponse;
  const artifacts = typedResponse.task?.artifacts;
  if (artifacts && artifacts.length > 0) {
    return artifacts[0].data || artifacts[0];
  }

  const taskText = getFirstText(typedResponse.task?.status?.message?.parts);
  if (taskText) {
    return taskText;
  }

  const messageText = getFirstText(typedResponse.message?.parts);
  if (messageText) {
    return messageText;
  }

  return response;
}

export function extractA2ASearchResult(response: unknown): unknown {
  if (typeof response === 'string') {
    return response;
  }

  if (!isObject(response)) {
    return response;
  }

  const typedResponse = response as A2AObjectResponse;
  const artifacts = typedResponse.task?.artifacts;
  if (artifacts && artifacts.length > 0) {
    const searchArtifact = artifacts.find(artifact => artifact.type === 'search-result');
    if (searchArtifact?.data && isObject(searchArtifact.data)) {
      const data = searchArtifact.data as Record<string, unknown>;
      return {
        searchResults: data.summary || searchArtifact.data,
        rawResults: data.rawResults || data.fullResponse,
        query: data.query,
        metadata: searchArtifact.metadata,
      };
    }

    return artifacts[0].data || response;
  }

  return extractA2AResult(response);
}
