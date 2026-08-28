import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listLedger, ledgerTotals, listClients } from '@/server/db';
import { currentSession } from '@/server/auth';

export const dynamic = 'force-dynamic';

const eur = (n: number) => '€' + Number(n || 0).toFixed(4);

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await currentSession();
  if (!session) redirect('/login');
  const { month } = await searchParams;
  const current = month || new Date().toISOString().slice(0, 7);
  const [entries, clients] = await Promise.all([listLedger(session.workspaceId, current), listClients(session.workspaceId)]);
  const totals = ledgerTotals(entries);
  const names = Object.fromEntries(clients.map((c) => [c.clientId, c.name]));

  return (
    <main className="shell">
      <p className="muted"><Link href="/clients">← Clients</Link></p>
      <h1>Ledger</h1>
      <p className="muted">Every model call, priced at its model&rsquo;s rate. {current}.</p>

      <div className="ledger-totals">
        <div><span className="muted">Month total</span><strong>{eur(totals.costEur)}</strong></div>
        <div><span className="muted">Calls</span><strong>{entries.length}</strong></div>
      </div>

      <h2 className="block-title" style={{ marginTop: 20 }}>By client</h2>
      <table className="grid-table"><tbody>
        <tr><th>Client</th><th>Cost</th></tr>
        {Object.entries(totals.byClient).map(([id, cost]) => (
          <tr key={id}><td>{names[id] || id}</td><td className="num">{eur(cost as number)}</td></tr>
        ))}
        {!Object.keys(totals.byClient).length && <tr><td colSpan={2} className="muted">No calls this month.</td></tr>}
      </tbody></table>

      <h2 className="block-title" style={{ marginTop: 20 }}>By agent</h2>
      <table className="grid-table"><tbody>
        <tr><th>Agent</th><th>Cost</th></tr>
        {Object.entries(totals.byAgent).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([agent, cost]) => (
          <tr key={agent}><td className="mono">{agent}</td><td className="num">{eur(cost as number)}</td></tr>
        ))}
      </tbody></table>

      <h2 className="block-title" style={{ marginTop: 20 }}>Calls</h2>
      <table className="grid-table"><tbody>
        <tr><th>When</th><th>Client</th><th>Agent</th><th>Model</th><th>In</th><th>Out</th><th>Searches</th><th>Images</th><th>Cost</th></tr>
        {entries.slice(0, 200).map((e) => (
          <tr key={e.entryId}>
            <td className="mono">{new Date(e.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>{names[e.clientId!] || '—'}</td>
            <td className="mono">{e.agent}</td>
            <td className="mono">{e.model}</td>
            <td className="num">{e.input.toLocaleString('en-GB')}</td>
            <td className="num">{e.output.toLocaleString('en-GB')}</td>
            <td className="num">{e.webSearches || 0}</td>
            <td className="num">{e.images || 0}</td>
            <td className="num">{eur(e.costEur)}</td>
          </tr>
        ))}
      </tbody></table>
    </main>
  );
}
