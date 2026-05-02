import { type FlueContext } from '@flue/sdk/client';
import { Daytona, type Sandbox } from '@daytona/sdk';
import { daytona } from '@flue/connectors/daytona';
import { SKILLS } from '../lib/skills.ts';

export const triggers = { webhook: true };

const AGENT_ID_LABEL = 'flue-agent-id';
const SANDBOX_CWD = '/home/daytona';
const SEED_MARKER = `${SANDBOX_CWD}/.agents/.seeded`;

/**
 * Cached sandbox per agent id.
 *
 * URL agent id → one Daytona sandbox, looked up by label. Same id reuses
 * the sandbox (files persist). Different id → different sandbox.
 *
 * Daytona auto-stops after 15 min idle (no compute charge while stopped).
 * Auto-archives 1 hr after stop (cheaper disk). Re-starts on next request.
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
 * Write skills.ts entries into the sandbox at the path Flue's runtime
 * discovers (`<cwd>/.agents/skills/<name>/SKILL.md`). Idempotent via a
 * marker file — only runs on a freshly created sandbox.
 *
 * To re-seed an existing sandbox after editing skills.ts, delete it (or
 * just delete the marker file) so the next request triggers a re-seed.
 */
async function seedSkills(sandbox: Sandbox): Promise<void> {
	try {
		await sandbox.fs.getFileDetails(SEED_MARKER);
		return;
	} catch {
		// marker missing — proceed with seeding
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
 * URL: POST /agents/assistant/<workspace-id>
 * Body: { message: string, threadId?: string }
 *
 * - workspace-id keys the Daytona sandbox (files persist within an id)
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
