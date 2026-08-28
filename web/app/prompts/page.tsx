import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { storeEnabled } from '@/server/firebase';
import PromptsClient from './prompts-client';

const orchestrator = require('@core/agents/orchestrator');

export const dynamic = 'force-dynamic';

export default async function Prompts() {
  if (!(await currentSession())) redirect('/login');
  const agents = Object.entries(orchestrator.roster).map(([name, a]: any) => ({
    name, model: a.model, tools: (a.tools || []).map((t: any) => t.name),
  }));

  return (
    <main className="shell">
      <p className="muted"><Link href="/settings">← Settings</Link></p>
      <h1>Prompts</h1>
      <p className="muted">
        Each agent&rsquo;s role. Editing one creates a version with a change note; every campaign records which
        version produced it. Run <code>node evals/gate.js</code> before you keep a change.
      </p>
      {!storeEnabled && (
        <p className="refusal">No store is configured, so the code defaults are in use and edits cannot be saved.</p>
      )}
      <PromptsClient agents={agents} editable={storeEnabled} />
    </main>
  );
}
