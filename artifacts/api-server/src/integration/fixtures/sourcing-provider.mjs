// Controlled upstream responses for the integration test only. The product
// uses the real provider endpoints; this preload is never loaded by pnpm local.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.hostname === 'freeserp.ai') return Response.json({ results: [{ url: 'https://sourcing-fixture.dev', title: 'Fixture Climate company', snippet: 'Fixture Climate company makes climate software. Founder Jane Builder. Contact hello@sourcing-fixture.dev at https://sourcing-fixture.dev/contact. Fixture Climate company has paying customers and is operating today.', published_at: new Date().toISOString().slice(0, 10) }] });
  if (url.hostname === 'openrouter.ai') {
    const body = JSON.parse(options.body);
    const research = JSON.parse(body.messages[1].content);
    let result;
    if (research.requestedChecks) {
      const source = research.evidence[0];
      const fact = value => ({ value, sourceId: source.id, quote: source.text });
      result = { facts: { description: fact('Makes climate software'), founders: fact('Jane Builder'), contact: fact('hello@sourcing-fixture.dev'), website: fact('https://sourcing-fixture.dev'), active: fact('true') }, checks: research.requestedChecks.map(criterion => ({ criterion, result: 'match', sourceId: source.id, quote: source.text })) };
    } else result = { companies: [{ name: 'Fixture Climate company', sourceId: research.evidence[0].id }] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }], usage: { total_tokens: 123 } });
  }
  // Integration tests must never accidentally contact another external service.
  if (url.hostname !== '127.0.0.1') throw new Error('Unexpected external request in sourcing test');
  return originalFetch(input, options);
};
