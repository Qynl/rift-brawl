import RiftBrawl from '@/components/game/RiftBrawl';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://qynl.github.io/rift-brawl';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Structured data. A shared link should show up as a game, not as a generic
 * web page — this is what search results and chat unfurls read.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'RIFT BRAWL',
  url: SITE,
  image: `${SITE}${BASE}/og.jpg`,
  description:
    'A browser platform fighter. Twelve original brawlers, each with its own signature resource, six dynamic stages, capability-gated AI, online lobby play and deterministic replays.',
  genre: ['Fighting', 'Platform fighter', 'Action'],
  gamePlatform: ['Web browser', 'PC', 'Mobile'],
  applicationCategory: 'Game',
  operatingSystem: 'Any (modern web browser)',
  playMode: ['SinglePlayer', 'MultiPlayer', 'CoOp'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4 },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  inLanguage: 'en',
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, author-controlled object — no user input reaches this.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      {/*
        The game is a canvas, so without this the page is literally empty to a
        crawler, a screen reader landing before hydration, or anyone with
        scripting off. It is removed from the accessibility tree once the app
        is up, because by then the real UI is there.
      */}
      <noscript>
        <div style={{ maxWidth: '46rem', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.7 }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '0.06em' }}>RIFT BRAWL</h1>
          <p style={{ opacity: 0.75 }}>
            A rift-powered platform fighter that runs entirely in your browser. RIFT BRAWL needs
            JavaScript — the fighters, the stages and the audio are all generated at runtime rather
            than downloaded.
          </p>
          <h2 style={{ fontSize: '1.1rem', letterSpacing: '0.2em', marginTop: '2rem' }}>WHAT IS IN IT</h2>
          <ul style={{ opacity: 0.75 }}>
            <li>Twelve brawlers, each with a signature resource — Ember overheats, Nova spends
              stars, Jaeger reloads, Titan shrugs off small hits entirely.</li>
            <li>Six stages with their own hazards: lava surges, breakable ice, rift portals, wind.</li>
            <li>An AI whose difficulty changes what it can do, not just how fast it reacts.</li>
            <li>Online lobbies for up to four players, local versus on one keyboard, arcade,
              survival, training and modifier challenges.</li>
            <li>Deterministic replays stored as input tracks — about 6 KB per minute of match.</li>
            <li>Full touch support, and it installs as an offline app.</li>
          </ul>
        </div>
      </noscript>

      <RiftBrawl />
    </>
  );
}
