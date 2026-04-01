/**
 * Must match DEFAULT_AGENT_TASK_TEMPLATE in src/agent_task_runner.py
 * (fallback when GET /api/settings/agent_task_message_template omits default_value).
 */
export const DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE =
  'Spin up a subagent that downloads markdown from here {read_url} and execute the instructions contained within it. Confirm when the sub agent is running and give me an occasional update if it runs long.'
