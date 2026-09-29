import LandingPage from '@/components/site/LandingPage';
import SiteShell from '@/components/site/SiteShell';

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
        The landing page itself is server-rendered, so a crawler or a reader
        with scripting off already has the full text of the site. All that is
        missing for them is the game, which is what this says.
      */}
      <noscript>
        <div
          style={{
            padding: '0.9rem 1.5rem',
            textAlign: 'center',
            background: '#2ee6a8',
            color: '#04150f',
            fontWeight: 800,
            fontSize: '0.8rem',
            letterSpacing: '0.08em',
          }}
        >
          RIFT BRAWL needs JavaScript to play — the fighters, stages and audio are all generated
          at runtime rather than downloaded. Everything below is still readable without it.
        </div>
      </noscript>

      {/*
        The site is server-rendered and sits in the static HTML; the shell is a
        thin client wrapper that swaps it for the game when someone hits play.
        Rendering the landing page as children (rather than importing it inside
        the shell) is what keeps it out of the client bundle.
      */}
      <SiteShell>
        <LandingPage />
      </SiteShell>
    </>
  );
}
