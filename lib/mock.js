/**
 * Mock mode.
 *
 * Set MOCK_CLAUDE=1 and the chain returns these fixtures instead of calling
 * the API. Two reasons to have this:
 *   - a reviewer can run the UI in thirty seconds with no key and no spend
 *   - front-end work doesn't cost tokens every reload
 *
 * The fixtures are shaped exactly like real responses, including a usage
 * object, so the economics footer works in mock mode too. One Google
 * headline is deliberately over the 30-char limit so the violation flag
 * is visible without needing a real model to slip.
 */

const FIXTURES = {
  brief: {
    productName: 'Ledgerline',
    productDescription: 'Ledgerline matches invoices, bank feeds and payment processor payouts automatically and flags exceptions for a finance team to review.',
    targetAudience: 'Finance leads and controllers at 50-500 person SaaS companies in the UK, Ireland and Portugal',
    objective: 'trial_signups',
    tone: 'direct',
    languages: ['en', 'pt'],
    notes: 'Trial is 14 days with no card. Do not claim integrations that are still in beta. Portuguese market launch in Q4.',
  },
  research: {
    company_summary:
      'Ledgerline is a reconciliation tool for finance teams at mid-market SaaS companies. It matches invoices, bank feeds and payment processor payouts automatically and flags exceptions for review.',
    positioning: 'Close the month without the spreadsheet.',
    voice: {
      observations: [
        'Short declarative sentences, rarely over 15 words',
        'Speaks to the finance lead directly as "you"',
        'Avoids hype; states what the product does and moves on',
        'Uses "exceptions" not "errors" for unmatched items',
      ],
      preferred_terms: ['close the month', 'exceptions', 'payout reconciliation', 'finance team'],
      avoid_terms: ['AI-powered', 'revolutionary', 'errors', 'bookkeeping'],
    },
    proof_points: [
      { claim: 'Customers report closing the month 4 days faster on average', source: 'customer-survey-2026.pdf' },
      { claim: 'Native connectors for Stripe, Adyen, GoCardless and 2,400 banks', source: 'https://ledgerline.example/integrations' },
      { claim: 'SOC 2 Type II certified', source: 'https://ledgerline.example/security' },
    ],
    product_facts: [
      'Pricing per connected entity, starting at EUR 190/month',
      '14-day trial with no card required',
      'Exports to Xero, QuickBooks, NetSuite and Sage',
    ],
    audience_insights: [
      'Finance leads at 50-500 person SaaS companies, typically 1-3 person finance team',
      'Main pain is the last week of the month spent matching payouts in spreadsheets',
      'Objection: "we already have an accounting system"; Ledgerline sits in front of it',
    ],
    competitors: ['manual spreadsheets', 'accounting system native matching', 'BlackLine (enterprise)'],
    glossary: [
      { term: 'Ledgerline', treatment: 'keep untranslated' },
      { term: 'exceptions', treatment: 'translate as "exceções"' },
      { term: 'payout reconciliation', treatment: 'translate as "reconciliação de pagamentos"' },
      { term: 'close the month', treatment: 'translate as "fechar o mês"' },
    ],
    gaps: ['No named customer logos in sources', 'No pricing comparison with competitors'],
    sources_used: ['customer-survey-2026.pdf', 'https://ledgerline.example/integrations', 'brand-voice.md'],
  },

  strategy: {
    angles: [
      {
        name: 'Four days back',
        summary: 'Lead with the measurable time saved at month end.',
        why_it_works: 'The audience feels the last week of the month as lost time; a number makes the promise concrete.',
      },
      {
        name: 'Sits in front of your ledger',
        summary: 'Position against the "we already have accounting software" objection.',
        why_it_works: 'Removes the replacement fear that stalls most evaluations.',
      },
      {
        name: 'Exceptions only',
        summary: 'Sell the review experience: you only ever look at what did not match.',
        why_it_works: 'Reframes the job from matching everything to reviewing a short list.',
      },
    ],
    lead_angle: 'Four days back',
    lead_reasoning:
      'The customer survey gives a real number, and trial signups respond to concrete outcomes more than to positioning. "Sits in front of your ledger" is the natural email 3 objection-handler rather than the lead.',
    hooks: {
      meta: 'Close the month four days faster. No spreadsheet.',
      linkedin: 'Your finance team loses a week a month to payout matching.',
      google: 'Close the Month 4 Days Faster',
      email: 'Where the last week of your month goes',
    },
    key_messages: [
      'Customers close the month 4 days faster on average',
      'Connects to Stripe, Adyen, GoCardless and 2,400 banks',
      'You review exceptions, not every line',
      'Sits in front of Xero, QuickBooks, NetSuite or Sage',
    ],
  },

  assets: {
    meta: [
      {
        primary_text: 'Finance teams using Ledgerline close the month 4 days faster. Payouts, invoices and bank feeds matched for you.',
        headline: 'Close the month 4 days faster',
        description: 'Start a free 14-day trial',
      },
      {
        primary_text: 'Still matching Stripe payouts in a spreadsheet? Ledgerline does it overnight and shows you only the exceptions.',
        headline: 'Only review the exceptions',
        description: 'No card needed to start',
      },
      {
        primary_text: 'Connects to Stripe, Adyen, GoCardless and 2,400 banks. Exports to the accounting system you already use.',
        headline: 'Works with your ledger',
        description: 'Xero, QuickBooks, NetSuite',
      },
    ],
    linkedin: [
      {
        intro_text: 'Your finance team loses about a week a month to payout matching. Ledgerline customers get four of those days back.',
        headline: 'Close the month 4 days faster with Ledgerline',
      },
      {
        intro_text: 'Automatic matching across Stripe, Adyen, GoCardless and 2,400 banks. Your team reviews exceptions, not every line.',
        headline: 'Payout reconciliation without the spreadsheet',
      },
      {
        intro_text: 'Ledgerline sits in front of Xero, QuickBooks, NetSuite or Sage. Nothing to replace, nothing to migrate.',
        headline: 'Reconciliation that works with your ledger, not against it',
      },
    ],
    google: {
      headlines: [
        'Close the Month 4 Days Faster',
        'Ledgerline Reconciliation',
        'Match Payouts Automatically',
        'Review Exceptions Only',
        'Free 14-Day Trial, No Card',
        'Works With Xero & NetSuite',
        'Stripe & Adyen Payout Matching Built In', // deliberately 39 chars: shows the validator flag
        'Ledgerline for Finance Teams',
      ],
      descriptions: [
        'Finance teams close the month 4 days faster. Payouts and bank feeds matched overnight.',
        'Connects to Stripe, Adyen, GoCardless and 2,400 banks. You only review the exceptions.',
        'Sits in front of the accounting system you already use. Nothing to migrate.',
        'Start a free 14-day trial. No card required. SOC 2 Type II certified.',
      ],
    },
    email: {
      emails: [
        {
          subject: 'Where the last week of your month goes',
          preview_text: 'Four days, on average, spent matching payouts by hand.',
          body:
            'Hi,\n\nMost finance teams we talk to lose the last week of every month to the same job: matching Stripe or Adyen payouts against invoices and bank feeds, line by line, in a spreadsheet.\n\nLedgerline does that matching overnight. It connects to your payment processors and 2,400 banks, matches what it can, and hands you a short list of exceptions to review. Customers close the month four days faster on average.\n\nIt sits in front of Xero, QuickBooks, NetSuite or Sage, so there is nothing to replace.\n\nIf you would like to see it on your own data, the trial is 14 days and needs no card.\n\nStart a trial\n\nThe Ledgerline team',
        },
        {
          subject: 'What "4 days faster" looks like in practice',
          preview_text: 'A finance lead walks through a month-end close with exceptions only.',
          body:
            'Hi,\n\nYesterday I mentioned that Ledgerline customers close the month four days faster. Here is what that looks like.\n\nOn the 1st, the payouts from the previous month are already matched. The finance lead opens Ledgerline and sees 23 exceptions out of 4,100 transactions: a refund that split across two payouts, a bank fee posted late, a duplicate invoice. Each one takes a minute or two.\n\nBy the afternoon of the 1st, reconciliation is done and the close moves on to accruals. No spreadsheet, no tab-switching between the processor dashboard and the bank.\n\nThe 14-day trial connects to your real accounts so you can see your own exception list.\n\nSee your exceptions\n\nThe Ledgerline team',
        },
        {
          subject: 'You already have accounting software. Good.',
          preview_text: 'Ledgerline does not replace it. It feeds it.',
          body:
            'Hi,\n\nThe most common question we get is whether Ledgerline replaces Xero, QuickBooks, NetSuite or Sage. It does not.\n\nYour accounting system is good at being a ledger. It is not built to match thousands of processor payouts against invoices and bank lines every month. Ledgerline does that in front of it and exports clean, matched entries into the system you already use.\n\nSo nothing to migrate, nothing to retrain the team on, and no change to your audit trail. SOC 2 Type II, if your security team asks.\n\nThe trial takes a few minutes to connect and runs for 14 days without a card.\n\nStart your trial\n\nThe Ledgerline team',
        },
      ],
      branch_note: 'If the reader clicked the link in email 2, send email 3 as the direct ask; if not, send email 3 as the objection handler above.',
    },
  },

  localise: {
    meta: [
      {
        primary_text: 'As equipas financeiras que usam o Ledgerline fecham o mês 4 dias mais cedo. Pagamentos, faturas e bancos conciliados.',
        headline: 'Feche o mês 4 dias mais cedo',
        description: 'Teste grátis de 14 dias',
      },
      {
        primary_text: 'Ainda concilia os pagamentos do Stripe em folhas de cálculo? O Ledgerline faz isso à noite e mostra-lhe só as exceções.',
        headline: 'Reveja apenas as exceções',
        description: 'Sem cartão para começar',
      },
      {
        primary_text: 'Liga-se ao Stripe, Adyen, GoCardless e a 2.400 bancos. Exporta para o sistema contabilístico que já utiliza.',
        headline: 'Funciona com o seu sistema',
        description: 'Xero, QuickBooks, NetSuite',
      },
    ],
    linkedin: [
      {
        intro_text: 'A sua equipa financeira perde cerca de uma semana por mês a conciliar pagamentos. Com o Ledgerline, recupera quatro dias.',
        headline: 'Feche o mês 4 dias mais cedo com o Ledgerline',
      },
      {
        intro_text: 'Conciliação automática entre Stripe, Adyen, GoCardless e 2.400 bancos. A equipa revê exceções, não cada linha.',
        headline: 'Reconciliação de pagamentos sem folhas de cálculo',
      },
      {
        intro_text: 'O Ledgerline trabalha à frente do Xero, QuickBooks, NetSuite ou Sage. Nada a substituir, nada a migrar.',
        headline: 'Reconciliação que funciona com o seu sistema contabilístico',
      },
    ],
    google: {
      headlines: [
        'Feche o Mês 4 Dias Mais Cedo',
        'Ledgerline Reconciliação',
        'Concilie Pagamentos Sozinho',
        'Reveja Só as Exceções',
        'Teste Grátis 14 Dias',
        'Compatível Com Xero e Sage',
        'Stripe e Adyen Integrados',
        'Ledgerline Para Finanças',
      ],
      descriptions: [
        'Equipas financeiras fecham o mês 4 dias mais cedo. Pagamentos e bancos conciliados.',
        'Liga-se ao Stripe, Adyen, GoCardless e a 2.400 bancos. Só revê as exceções.',
        'Trabalha à frente do sistema contabilístico que já utiliza. Nada a migrar.',
        'Comece um teste grátis de 14 dias. Sem cartão. Certificação SOC 2 Type II.',
      ],
    },
    email: {
      emails: [
        {
          subject: 'Para onde vai a última semana do seu mês',
          preview_text: 'Quatro dias, em média, a conciliar pagamentos à mão.',
          body:
            'Bom dia,\n\nA maioria das equipas financeiras com quem falamos perde a última semana de cada mês na mesma tarefa: conciliar os pagamentos do Stripe ou da Adyen com faturas e extratos bancários, linha a linha, numa folha de cálculo.\n\nO Ledgerline faz essa conciliação durante a noite. Liga-se aos seus processadores de pagamento e a 2.400 bancos, concilia o que consegue e entrega-lhe uma lista curta de exceções para rever. Os clientes fecham o mês, em média, quatro dias mais cedo.\n\nTrabalha à frente do Xero, QuickBooks, NetSuite ou Sage, pelo que não há nada a substituir.\n\nSe quiser vê-lo com os seus próprios dados, o teste dura 14 dias e não exige cartão.\n\nComeçar o teste\n\nA equipa Ledgerline',
        },
        {
          subject: 'O que significa "4 dias mais cedo" na prática',
          preview_text: 'Um responsável financeiro fecha o mês apenas com exceções.',
          body:
            'Bom dia,\n\nOntem referi que os clientes do Ledgerline fecham o mês quatro dias mais cedo. É assim que isso acontece.\n\nNo dia 1, os pagamentos do mês anterior já estão conciliados. O responsável financeiro abre o Ledgerline e vê 23 exceções em 4.100 transações: um reembolso dividido por dois pagamentos, uma comissão bancária lançada tarde, uma fatura duplicada. Cada uma demora um ou dois minutos.\n\nA meio da tarde do dia 1, a reconciliação está feita e o fecho avança para os acréscimos. Sem folha de cálculo, sem saltar entre o painel do processador e o banco.\n\nO teste de 14 dias liga-se às suas contas reais, para ver a sua própria lista de exceções.\n\nVer as minhas exceções\n\nA equipa Ledgerline',
        },
        {
          subject: 'Já tem software de contabilidade. Ainda bem.',
          preview_text: 'O Ledgerline não o substitui. Alimenta-o.',
          body:
            'Bom dia,\n\nA pergunta mais frequente que recebemos é se o Ledgerline substitui o Xero, o QuickBooks, o NetSuite ou o Sage. Não substitui.\n\nO seu sistema contabilístico é bom a ser um razão. Não foi construído para conciliar milhares de pagamentos de processadores com faturas e linhas bancárias todos os meses. O Ledgerline faz isso à frente dele e exporta lançamentos limpos e conciliados para o sistema que já utiliza.\n\nOu seja, nada a migrar, nada em que voltar a formar a equipa e nenhuma alteração ao registo de auditoria. SOC 2 Type II, se a sua equipa de segurança perguntar.\n\nO teste demora alguns minutos a configurar e dura 14 dias sem cartão.\n\nComeçar o teste\n\nA equipa Ledgerline',
        },
      ],
      branch_note: 'Se o leitor clicou no email 2, o email 3 faz o pedido direto; se não clicou, o email 3 responde à objeção acima.',
    },
  },
};

// Plausible usage numbers so the economics footer means something in mock mode.
const USAGE = {
  brief: { input: 2140, output: 210 },
  research: { input: 6120, output: 780 },
  strategy: { input: 1460, output: 520 },
  assets: { input: 2380, output: 2210 },
  localise: { input: 3120, output: 2360 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mockCall(label) {
  await sleep(600 + Math.random() * 600); // enough delay for the stepper to be visible
  return {
    data: JSON.parse(JSON.stringify(FIXTURES[label])),
    usage: { ...USAGE[label], webSearches: label === 'research' ? 2 : 0 },
    ms: 900,
  };
}

module.exports = { mockCall, FIXTURES };
