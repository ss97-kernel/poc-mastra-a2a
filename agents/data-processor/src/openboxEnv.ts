import dotenv from 'dotenv';

dotenv.config();

export function applyDataProcessorOpenBoxEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!env.OPENBOX_API_KEY && env.OPENBOX_DATA_PROCESSOR_API_KEY) {
    env.OPENBOX_API_KEY = env.OPENBOX_DATA_PROCESSOR_API_KEY;
  }

  if (!env.OPENBOX_AGENT_DID && env.OPENBOX_DATA_PROCESSOR_AGENT_DID) {
    env.OPENBOX_AGENT_DID = env.OPENBOX_DATA_PROCESSOR_AGENT_DID;
  }

  if (
    !env.OPENBOX_AGENT_PRIVATE_KEY &&
    env.OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY
  ) {
    env.OPENBOX_AGENT_PRIVATE_KEY =
      env.OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY;
  }
}

applyDataProcessorOpenBoxEnv();
