// ============ RIFT BRAWL — landing page ============
//
// A server component on purpose. Everything here is in the static HTML, so a
// crawler, a link unfurl, a screen reader arriving before hydration and a
// visitor with scripting off all get the real page. The only client code on
// it is the handful of buttons that launch the game.

import {
  CONTROLS, FAQ, FEATURES, MODES, ROSTER, ROSTER_ORDER, STAGES, STATS,
} from '@/lib/site/content';
import PlayButton from './PlayButton';
import ModeCard from './ModeCard';
import StartConsole from './StartConsole';

const REPO = 'https://github.com/Qynl/rift-brawl';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] tracking-[0.34em] font-bold text-[#2ee6a8]/70">{children}</p>
  );
}

export default function LandingPage() {
  return (
    <div className="site-root">
      {/* ---------------------------------------------------------- nav */}
      <header className="site-nav">
        <div className="site-wrap flex items-center justify-between gap-6 py-4">
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <span aria-hidden className="site-mark" />
            <span className="text-[13px] font-black tracking-[0.26em]">RIFT BRAWL</span>
          </a>

          <nav aria-label="Sections" className="hidden md:flex items-center gap-1">
            {[
              ['Roster', '#roster'],
              ['Stages', '#stages'],
              ['Depth', '#depth'],
              ['Controls', '#controls'],
              ['FAQ', '#faq'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="site-navlink">
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="site-navlink hidden sm:inline-flex"
            >
              Source
            </a>
            <PlayButton variant="primary" className="!px-5 !py-2.5">
              PLAY
            </PlayButton>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ------------------------------------------------------- hero */}
        <section className="site-hero">
          <div aria-hidden className="site-hero-glow" />
          <div aria-hidden className="site-grid" />

          <div className="site-wrap relative">
            <a href="#depth" className="site-pill">
              <span className="site-pill-dot" />
              Deterministic replays — a full match stored in 6 KB per minute
              <span aria-hidden className="text-white/30">→</span>
            </a>

            <h1 className="site-h1">
              Enter <span className="site-h1-accent">the rift</span>
            </h1>

            <p className="site-lede">
              A platform fighter that runs in a browser tab. Twelve brawlers who each play by a
              rule nobody else has, six stages that fight back, and real frame data underneath all
              of it. No account, no download, no launcher — the page you are on is 178&nbsp;KB.
            </p>

            <div className="mt-10">
              <StartConsole />
            </div>

            <div className="site-chips" role="group" aria-label="Game modes">
              {MODES.map((m) => (
                <ModeCard key={m.id} mode={m.id} title={m.title} blurb={m.blurb} />
              ))}
            </div>

            <p className="mt-8 text-[11px] tracking-[0.14em] text-white/25 font-bold">
              KEYBOARD, GAMEPAD AND TOUCH · INSTALLS AND RUNS OFFLINE · OPEN SOURCE
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ stats */}
        <section className="site-stats" aria-label="At a glance">
          <div className="site-wrap grid grid-cols-3 md:grid-cols-6">
            {STATS.map((s) => (
              <div key={s.label} className="site-stat">
                <div className="site-stat-value">{s.value}</div>
                <div className="site-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- roster */}
        <section id="roster" className="site-section">
          <div className="site-wrap">
            <SectionLabel>THE ROSTER</SectionLabel>
            <h2 className="site-h2">
              Twelve fighters. Twelve <span className="site-em">different games</span>.
            </h2>
            <p className="site-sub">
              The usual trick is to give everyone the same kit in different colours. Here each
              brawler owns a resource nobody else has, and it dictates how you are supposed to
              play them. Titan is not a slower Vanguard — he is a fighter your jabs cannot move.
            </p>

            <ul className="site-cards mt-12">
              {ROSTER_ORDER.map((id) => {
                const f = ROSTER[id];
                return (
                  <li
                    key={id}
                    className="site-card"
                    style={{ ['--accent' as string]: f.color }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="site-card-name">{f.name}</h3>
                      <span className="site-card-res">{f.resource}</span>
                    </div>
                    <p className="site-card-arch">
                      {f.archetype} · {f.weapon}
                    </p>
                    <p className="site-card-body">{f.rule}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------- stages */}
        <section id="stages" className="site-section">
          <div className="site-wrap">
            <SectionLabel>THE STAGES</SectionLabel>
            <h2 className="site-h2">
              Six arenas that <span className="site-em">take part</span>
            </h2>
            <p className="site-sub">
              Hazards that change what a safe recovery looks like, not scenery that scrolls past.
              Each stage is drawn procedurally from a seed, so it is a few kilobytes of code
              rather than a few megabytes of art.
            </p>

            <ul className="site-cards site-cards-3 mt-12">
              {STAGES.map((s) => (
                <li
                  key={s.id}
                  className="site-card"
                  style={{ ['--accent' as string]: s.color }}
                >
                  <h3 className="site-card-name">{s.name}</h3>
                  <p className="site-card-body mt-3">{s.blurb}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------ depth */}
        <section id="depth" className="site-section">
          <div className="site-wrap">
            <SectionLabel>UNDER THE HOOD</SectionLabel>
            <h2 className="site-h2">
              Built like a fighting game, <span className="site-em">shipped like a web page</span>
            </h2>

            <ul className="site-cards site-cards-2 mt-12">
              {FEATURES.map((f) => (
                <li key={f.title} className="site-card site-card-plain">
                  <p className="site-card-res">{f.label}</p>
                  <h3 className="site-feature-title">{f.title}</h3>
                  <p className="site-card-body mt-3">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------- controls */}
        <section id="controls" className="site-section">
          <div className="site-wrap grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-start">
            <div>
              <SectionLabel>GETTING IN</SectionLabel>
              <h2 className="site-h2">
                Playable in <span className="site-em">thirty seconds</span>
              </h2>
              <p className="site-sub">
                Defaults below, all of them remappable, for both players. Gamepads are picked up
                automatically. On a phone you get an analog stick and buttons instead, and the
                whole game installs to the home screen and runs with no connection.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PlayButton variant="primary" mode="quick">
                  START A MATCH
                </PlayButton>
                <PlayButton variant="ghost" mode="training">
                  OPEN TRAINING
                </PlayButton>
              </div>
            </div>

            <div className="site-keys">
              <table className="w-full border-collapse">
                <caption className="sr-only">Default keyboard controls for player one</caption>
                <tbody>
                  {CONTROLS.map((c) => (
                    <tr key={c.action} className="site-key-row">
                      <th scope="row" className="site-key-action">{c.action}</th>
                      <td className="site-key-key">
                        {c.key.split(' / ').map((k) => (
                          <kbd key={k} className="site-kbd">{k}</kbd>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- faq */}
        <section id="faq" className="site-section">
          <div className="site-wrap">
            <SectionLabel>QUESTIONS</SectionLabel>
            <h2 className="site-h2">The short answers</h2>

            <dl className="mt-12 grid md:grid-cols-2 gap-x-14 gap-y-10">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="site-faq-q">{f.q}</dt>
                  <dd className="site-card-body mt-2.5">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* -------------------------------------------------------- cta */}
        <section className="site-section">
          <div className="site-wrap">
            <div className="site-cta">
              <div aria-hidden className="site-hero-glow site-hero-glow-sm" />
              <h2 className="site-cta-title">
                It is already <span className="site-em">loaded</span>.
              </h2>
              <p className="site-sub mx-auto max-w-xl">
                The game is sitting in the tab you are reading this in. One click and you are in a
                match — nothing to install, nothing to sign up for.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PlayButton variant="primary" mode="quick">
                  PLAY NOW
                </PlayButton>
                <PlayButton variant="ghost" mode="local">
                  TWO PLAYERS, ONE KEYBOARD
                </PlayButton>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="site-footer">
        <div className="site-wrap flex flex-col sm:flex-row items-center justify-between gap-5 py-10">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="site-mark" />
            <span className="text-[11px] font-black tracking-[0.26em] text-white/55">
              RIFT BRAWL
            </span>
          </div>
          <p className="text-[11px] tracking-[0.1em] text-white/30 text-center">
            Original characters, art and audio — every sound is synthesised at runtime.
          </p>
          <a href={REPO} target="_blank" rel="noreferrer" className="site-navlink">
            View source
          </a>
        </div>
      </footer>
    </div>
  );
}
