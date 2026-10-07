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
    href: "/airdrop"
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
    href: "/airdrop"
  },
  {
    id: "n7",
    date: "2026-10-04",
    kind: "eco",
    t: "nw7.t",
    d: "nw7.d",
    href: "https://forum.omc.network/?utm_source=site&utm_medium=news",
    external: true
  },
  {
    id: "n8",
    date: "2026-10-04",
    kind: "vo",
    t: "nw8.t",
    d: "nw8.d",
    href: "https://forum.omc.network/posts/the-power-wall-not-gpus?utm_source=site&utm_medium=news",
    external: true
  },
  {
    id: "n9",
    date: "2026-10-03",
    kind: "dev",
    t: "nw9.t",
    d: "nw9.d",
    href: "https://forum.omc.network/posts/gpu-cloud-pricing-is-a-scam?utm_source=site&utm_medium=news",
    external: true
  },
  {
    id: "n10",
    date: "2026-10-03",
    kind: "vo",
    t: "nw10.t",
    d: "nw10.d",
    href: "https://forum.omc.network/posts/depin-2026-who-actually-has-users?utm_source=site&utm_medium=news",
    external: true
  },
  {
    id: "n11",
    date: "2026-10-02",
    kind: "vo",
    t: "nw11.t",
    d: "nw11.d",
    href: "https://forum.omc.network/posts/real-cost-of-training-a-model-2026?utm_source=site&utm_medium=news",
    external: true
  }
];
