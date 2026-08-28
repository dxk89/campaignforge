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
    campaign_facts: ['Trial is 14 days, no card', 'CTA: Start a free trial'],
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

FIXTURES.activation = {
  lifecycle: {
    entry: 'Submits the trial form, or clicks a paid ad and leaves without starting a trial (retargeting list)',
    steps: [
      { id: 's1', type: 'email', email: 1, note: 'Introduce the four-days-back angle the day after entry' },
      { id: 's2', type: 'wait', days: 3 },
      { id: 's3', type: 'email', email: 2, note: 'The strongest proof: a walkthrough of an exceptions-only close' },
      { id: 's4', type: 'wait', days: 2 },
      { id: 's5', type: 'branch', signal: 'clicked the "See your exceptions" link in email 2', yes: 's7', no: 's6', note: 'A click on the walkthrough means the pain is real; go straight to the ask' },
      { id: 's6', type: 'email', email: 3, note: 'Objection handler: we sit in front of your ledger' },
      { id: 's7', type: 'branch', signal: 'connected at least one bank or processor in the trial', yes: 's8', no: 's9' },
      { id: 's8', type: 'handoff', note: 'Connected trial: BDR receives the account, connected sources, exception count, and the emails opened' },
      { id: 's9', type: 'exit', note: 'No connection after email 3: leave the sequence, move to the monthly newsletter' },
    ],
    signals_used: ['email 2 click', 'trial created', 'bank or processor connected', 'unsubscribe'],
    exit_rules: ['Replied to any email', 'Booked a call', 'Became a paying customer', 'Unsubscribed'],
  },
  handoff: {
    mql_definition: ['Job title contains finance, controller, CFO or accounting', 'Company size 50 to 500', 'Trial created', 'At least one source connected OR clicked email 2'],
    lead_score: [
      { signal: 'Title matches finance lead / controller / CFO', points: 15, why: 'the buyer, not a researcher' },
      { signal: 'Company 50-500 employees', points: 10, why: 'the size where the spreadsheet breaks' },
      { signal: 'Trial created', points: 15, why: 'intent' },
      { signal: 'Connected a bank or processor', points: 25, why: 'they have seen their own exceptions' },
      { signal: 'Clicked email 2', points: 10, why: 'engaged with the proof' },
      { signal: 'Visited pricing page', points: 10, why: 'evaluating cost' },
    ],
    threshold: 45,
    sla: 'BDR contacts within one business day of crossing 45 points; connected trials within four hours',
    bdr_sop: [
      'Open the lead record: check connected sources and exception count before writing anything',
      'First touch references their exception count, not the product',
      'Offer a 20-minute review of their exceptions, not a demo',
      'Log the outcome in the CRM with the campaign name; no free-text-only notes',
      'No reply in 3 business days: one follow-up, then return to marketing nurture',
    ],
    talk_track: {
      opening: 'You connected Stripe last week and Ledgerline found 23 exceptions. Want to go through them together?',
      objections: [
        { objection: 'We already have Xero doing this', response: 'Ledgerline sits in front of Xero. It does the matching Xero was never built for and exports clean entries into it.' },
        { objection: 'We do this in a spreadsheet and it works', response: 'It does, for about a week a month. The trial shows what that week looks like when the matching is already done.' },
      ],
    },
    disqualifiers: ['Student or personal email', 'Company under 10 employees', 'Agency evaluating on behalf of clients'],
  },
  measurement: {
    kpi_tree: [
      { stage: 'reach', metric: 'Impressions by channel', target: 'set after week 1', source: 'LinkedIn Campaign Manager, Meta Ads, Google Ads' },
      { stage: 'engagement', metric: 'Click-through rate by variant', target: 'set after week 1', source: 'Ad platforms' },
      { stage: 'capture', metric: 'Trials created', target: '120', source: 'App database via CRM sync' },
      { stage: 'qualification', metric: 'MQLs (score over 45)', target: '60', source: 'CRM' },
      { stage: 'pipeline', metric: 'Opportunities created from campaign', target: '20', source: 'CRM, campaign field' },
      { stage: 'revenue', metric: 'Closed-won ARR attributed', target: 'set after week 1', source: 'CRM' },
    ],
    funnel: [
      { stage: 'Visit', definition: 'Landing page session with a campaign UTM' },
      { stage: 'Trial', definition: 'Account created with the campaign UTM on the signup event' },
      { stage: 'Connected', definition: 'At least one bank or processor connected within 14 days' },
      { stage: 'MQL', definition: 'Lead score over 45' },
      { stage: 'Opportunity', definition: 'BDR-created opportunity with this campaign as source' },
    ],
    reporting_cadence: 'Weekly: marketing and the BDR lead review spend, trials, connected rate, MQLs and opportunities. Monthly: pipeline and ARR attributed.',
    data_quality: [
      'UTM parameters required on every link; ads without them are paused',
      'Campaign name identical in ad platforms, CRM campaign field and app signup event',
      'Dedupe on work email before scoring; personal domains routed out',
      '30-day first-touch attribution for trials, 90-day any-touch for opportunities',
    ],
  },
  experiments: [
    { channel: 'linkedin', hypothesis: 'A time-saved number beats a positioning line for this audience', variants: 'variant 1 (4 days faster) vs variant 3 (works with your ledger)', primary_metric: 'Trials created per 1,000 impressions', decision_rule: 'After 500 clicks per variant, keep the winner if the gap is over 20%; otherwise keep both' },
    { channel: 'meta', hypothesis: 'The exceptions-only message outperforms the integrations message on cold traffic', variants: 'variant 2 vs variant 3', primary_metric: 'Landing page conversion', decision_rule: 'After 300 clicks per variant, shift 70% of budget to the winner' },
    { channel: 'email', hypothesis: 'Readers who see the walkthrough (email 2) convert to connected trials at a higher rate', variants: 'sequence with email 2 vs sequence skipping to email 3', primary_metric: 'Connected trial rate', decision_rule: 'Run on the first 400 entrants; if email 2 lifts connected rate by 5 points, keep it' },
  ],
};

FIXTURES.audience = {
  who: 'A finance lead or controller at a 50-500 person SaaS company, usually the only person who understands the payout data. Reports to a CFO or founder. The last week of the month is spent in a spreadsheet matching Stripe payouts to invoices; the rest of the month is spent dreading it.',
  language: ['month-end close', 'payout reconciliation', 'Stripe fees are a black box', 'the recon spreadsheet', 'unmatched transactions', 'we close on the 5th if we are lucky', 'accruals', 'I just want the numbers to tie'],
  pains: ['Processor payouts arrive net of fees and refunds, so nothing matches the invoice', 'Bank feeds and processor reports disagree on dates', 'One person owns the spreadsheet and it breaks when they are on holiday', 'Auditors ask for the matching logic and it lives in someone\'s head'],
  triggers: ['A missed close deadline', 'Adding a second payment processor', 'First audit', 'Hiring a second finance person and having to explain the spreadsheet'],
  objections: ['We already have Xero doing bank rec', 'Our volumes are not high enough to justify a tool', 'Another integration to maintain'],
  where_they_gather: ['r/accounting and r/FinancialCareers (venting and how-to)', 'The SaaS CFO newsletter (benchmarks)', 'Controller Slack communities (tool recommendations)', 'LinkedIn finance-ops posts (peer visibility)'],
  content_they_consume: ['Close checklists and templates', 'Peer war stories about month-end', 'Short comparisons of tools they already know', 'Benchmarks on days-to-close'],
  competitor_messages: [
    { competitor: 'the status quo', message: 'A good spreadsheet and discipline is enough', weakness: 'Silent on what happens at 2x volume or when the owner leaves' },
    { competitor: 'accounting system native matching', message: 'Bank rec is built in', weakness: 'Matches bank lines, not processor payouts net of fees' },
  ],
  search_terms: ['stripe payout reconciliation', 'reconcile stripe payouts xero', 'month end close automation saas', 'payout matching tool'],
  sources: ['https://example.com/thread-1', 'https://example.com/newsletter'],
};

// A 32-post month built from a few base posts, so the calendar view has real shape.
(function buildSocial() {
  const base = {
    educate: [
      { text: 'Close checklist, day 1: pull every payout report before you open the bank feed. Matching against the bank first is how the fees go missing.\n\nThree steps that save an afternoon:\n1. Payout reports first\n2. Then invoices\n3. Bank feed last, as the tie-out', hashtags: ['monthend', 'financeops'], graphic: { template: 'list', kicker: 'Close checklist', headline: 'Order of operations', body: ['Payout reports first', 'Then invoices', 'Bank feed last'] } },
      { text: 'Stripe fees are not a black box. They are a column you have not exported yet. The balance transactions report has fee per transaction; most teams reconcile from the payout summary instead and lose it.', hashtags: ['stripe', 'reconciliation'], graphic: null },
      { text: 'Days-to-close is the number your CFO watches. The input nobody measures is unmatched transactions per 1,000. Track that and the close date takes care of itself.', hashtags: ['financeops'], graphic: { template: 'tip', kicker: 'Metric', headline: 'Measure unmatched per 1,000', body: 'Days-to-close is the output. Unmatched transactions per thousand is the input you can act on.' } },
    ],
    proof: [
      { text: 'Customers close the month four days faster on average. Not because matching got faster. Because they stopped matching and started reviewing exceptions.', hashtags: ['monthend'], graphic: { template: 'stat', kicker: 'Month-end close', headline: '4 days', body: 'faster on average, reviewing exceptions only' } },
      { text: '"We close on the 2nd now. We used to say the 5th if we were lucky." A finance lead at a 120-person SaaS company, three months after connecting Stripe and Adyen.', hashtags: ['financeops', 'saas'], graphic: { template: 'quote', headline: 'We close on the 2nd now. We used to say the 5th if we were lucky.', footer: 'Finance lead, 120-person SaaS company' } },
    ],
    product: [
      { text: 'What Ledgerline does, in one sentence: matches payouts, invoices and bank feeds overnight, and hands you the exceptions in the morning. 2,400 banks, Stripe, Adyen, GoCardless. Exports to the ledger you already use.', hashtags: ['ledgerline'], graphic: { template: 'announce', kicker: 'Ledgerline', headline: 'Exceptions, not every line', body: 'Matched overnight. Reviewed by you in the morning.', footer: 'Start a free trial' } },
      { text: 'Ledgerline does not replace Xero, QuickBooks, NetSuite or Sage. It sits in front of them and does the matching they were never built for.', hashtags: ['xero', 'netsuite'], graphic: null },
    ],
    'point-of-view': [
      { text: 'Unpopular opinion for finance teams: the recon spreadsheet is not a process. It is a person. When that person is on holiday, you do not have a process.', hashtags: ['financeops'], graphic: { template: 'quote', headline: 'The recon spreadsheet is not a process. It is a person.', footer: 'Ledgerline' } },
      { text: 'The last week of the month should not be the only week finance remembers. If it is, the matching is being done by hand.', hashtags: ['monthend'], graphic: null },
    ],
    engage: [
      { text: 'Finance leads: what day of the month do you actually close? Reply with the number. We will share the spread next week.', hashtags: ['monthend'], graphic: null },
    ],
  };
  const plan = [];
  const weekPattern = [['linkedin', 1], ['x', 2], ['instagram', 3], ['linkedin', 3], ['x', 4], ['linkedin', 5], ['x', 6], ['instagram', 6]];
  const pillarCycle = ['educate', 'proof', 'product', 'educate', 'point-of-view', 'engage', 'educate', 'proof'];
  const counters = {};
  for (let w = 0; w < 4; w++) {
    weekPattern.forEach(([channel, d], i) => {
      const pillar = pillarCycle[(i + w) % pillarCycle.length];
      const pool = base[pillar];
      const src = pool[(counters[pillar] = (counters[pillar] || 0) + 1) % pool.length];
      let text = src.text;
      if (channel === 'x') text = text.split('\n')[0].slice(0, 240);
      const graphic = channel === 'instagram' ? (src.graphic || { template: 'tip', kicker: pillar, headline: text.split('.')[0].slice(0, 48), body: text.slice(0, 120) }) : (channel === 'linkedin' && src.graphic ? src.graphic : null);
      plan.push({ day: w * 7 + d, channel, pillar, text, hashtags: src.hashtags, cta: pillar === 'product' ? 'Start a free trial' : '', graphic: graphic ? { ...graphic, image_prompt: 'A finance lead at a tidy desk closing a laptop at the end of the day, empty open-plan office behind, warm evening light, calm' } : null });
    });
  }
  FIXTURES.social = {
    pillars: [
      { name: 'educate', theme: 'Practical close mechanics: order of operations, where fees hide, what to measure' },
      { name: 'proof', theme: 'Four days back, in customers\' words' },
      { name: 'product', theme: 'What Ledgerline does and does not replace' },
      { name: 'point-of-view', theme: 'The spreadsheet is a person, not a process' },
      { name: 'engage', theme: 'Ask about close dates and share the spread' },
    ],
    posts: plan,
  };
})();

FIXTURES.critic = {
  verdict: 'revise',
  must_fix: [
    {
      path: 'email.emails[1].body',
      problem: 'The walkthrough figures (23 exceptions out of 4,100) read as a customer result but no approved claim supports them.',
      why: 'A number that looks like a customer outcome and is not one is the client\'s liability, not ours. Frame it explicitly as an illustrative scenario or cut it.',
    },
  ],
  suggestions: [
    'Meta variant 3 opens with compatibility, which is the weakest of the three hooks for a cold audience. Consider leading with the exceptions mechanism.',
    'The LinkedIn variants all open with a statistic. One opening with a scene would give the set more range.',
  ],
};

// Plausible usage numbers so the economics footer means something in mock mode.
const USAGE = {
  brief: { input: 2140, output: 210 },
  research: { input: 6120, output: 780 },
  strategy: { input: 1460, output: 520 },
  assets: { input: 2380, output: 2210 },
  audience: { input: 4100, output: 1450 },
  social: { input: 5600, output: 6900 },
  activation: { input: 4900, output: 2650 },
  critic: { input: 3200, output: 620 },
  localise: { input: 3120, output: 2360 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mockCall(label) {
  await sleep(600 + Math.random() * 600); // enough delay for the stepper to be visible
  return {
    data: JSON.parse(JSON.stringify(FIXTURES[label])),
    usage: { ...USAGE[label], webSearches: label === 'research' ? 2 : label === 'audience' ? 6 : 0 },
    ms: 900,
  };
}

module.exports = { mockCall, FIXTURES };
