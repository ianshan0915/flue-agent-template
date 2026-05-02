import { type FlueContext } from '@flue/sdk/client';
import { Daytona, type Sandbox } from '@daytona/sdk';
import { daytona } from '@flue/connectors/daytona';

// Skill content — authored as Markdown at the canonical Flue path.
// Wrangler's Text rule (wrangler.jsonc) bundles them into the Worker,
// then `seedSkills()` writes them into the sandbox at runtime so the
// agent's discovery picks them up at `<cwd>/.agents/skills/<name>/SKILL.md`.
import explore from '../../.agents/skills/explore/SKILL.md';
import summarize from '../../.agents/skills/summarize/SKILL.md';
import plan from '../../.agents/skills/plan/SKILL.md';

const SKILLS: Record<string, string> = { explore, summarize, plan };

export const triggers = { webhook: true };

const AGENT_ID_LABEL = 'flue-agent-id';
const SANDBOX_CWD = '/home/daytona';
const SEED_MARKER = `${SANDBOX_CWD}/.agents/.seeded`;

/**
 * Cached sandbox per agent id.
 *
 * Same id reuses the sandbox (files persist). Different id → different
 * sandbox. Daytona auto-stops after 15 min idle (no compute charge),
 * auto-archives 1 hr after stop (cheaper disk), restarts on demand.
 */
async function getOrCreateSandbox(client: Daytona, agentId: string): Promise<Sandbox> {
	const found = await client.list({ [AGENT_ID_LABEL]: agentId });
	const existing = found.items[0];
	if (existing) {
		const state = (existing as unknown as { state?: string }).state;
		if (state !== 'started') await existing.start();
		return existing;
	}
	return await client.create({
		labels: { [AGENT_ID_LABEL]: agentId },
		autoStopInterval: 15,
		autoArchiveInterval: 60,
	});
}

/**
 * Seed bundled skill markdown into the sandbox at the path Flue's runtime
 * discovers. Idempotent via a marker file — only runs once per sandbox.
 *
 * To re-seed after editing a skill: delete the sandbox (or the marker)
 * so the next request triggers seeding again.
 */
async function seedSkills(sandbox: Sandbox): Promise<void> {
	try {
		await sandbox.fs.getFileDetails(SEED_MARKER);
		return;
	} catch {
		// marker missing — proceed
	}

	await sandbox.process.executeCommand(`mkdir -p ${SANDBOX_CWD}/.agents/skills`);

	for (const [name, content] of Object.entries(SKILLS)) {
		const dir = `${SANDBOX_CWD}/.agents/skills/${name}`;
		await sandbox.process.executeCommand(`mkdir -p ${dir}`);
		await sandbox.fs.uploadFile(Buffer.from(content, 'utf-8'), `${dir}/SKILL.md`);
	}

	await sandbox.fs.uploadFile(Buffer.from(''), SEED_MARKER);
}

/**
 * Assistant agent.
 *
 *   POST /agents/assistant/<workspace-id>
 *   Body: { message: string, threadId?: string }
 *
 * - workspace-id keys the Daytona sandbox (files persist)
 * - threadId keys the conversation history within that workspace
 */
export default async function ({ init, env, payload, id }: FlueContext) {
	if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

	const client = new Daytona({ apiKey: env.DAYTONA_API_KEY });
	const sandbox = await getOrCreateSandbox(client, id);
	await seedSkills(sandbox);

	const agent = await init({
		sandbox: daytona(sandbox),
		model: 'google/gemini-3.1-pro-preview',
	});

	const threadId: string | undefined = payload.threadId;
	const session = threadId ? await agent.session(threadId) : await agent.session();

	const message = payload.message ?? '';
	const response = await session.prompt(message);
	return { reply: response.text };
}
