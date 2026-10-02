/* ============================================================
   Omniverse Compute (OMC) — News feed data
   Add a post by appending one object below.
   - date : ISO date (display is localised via Intl)
   - kind : dev | airdrop | eco | gov   (drives the filter chips)
   - pin  : true → shown first with a badge
   - t/d  : i18n keys for the title and the excerpt
   - href : where "open" points (page or external URL)
   ============================================================ */

window.OMC_NEWS = [
  {
    id: "n1",
    date: "2026-10-01",
    kind: "dev",
    pin: true,
    t: "nw1.t",
    d: "nw1.d",
    href: "testnet.html"
  },
  {
    id: "n5",
    date: "2026-10-02",
    kind: "gov",
    t: "nw5.t",
    d: "nw5.d",
    href: "whitepaper.html#s5"
  },
  {
    id: "n2",
    date: "2026-09-30",
    kind: "airdrop",
    t: "nw2.t",
    d: "nw2.d",
    href: "airdrop.html"
  },
  {
    id: "n3",
    date: "2026-09-29",
    kind: "dev",
    t: "nw3.t",
    d: "nw3.d",
    href: "whitepaper.html"
  },
  {
    id: "n4",
    date: "2026-09-28",
    kind: "eco",
    t: "nw4.t",
    d: "nw4.d",
    href: "https://github.com/CBTdao/omc-network",
    external: true
  },
  {
    id: "n6",
    date: "2026-09-27",
    kind: "airdrop",
    t: "nw6.t",
    d: "nw6.d",
    href: "airdrop.html"
  }
];
