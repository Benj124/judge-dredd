export type GraphSeed = {
  /** Stable id used as text_documents.slug */
  slug: string;
  /** Human label for logs and meta */
  label: string;
  /** Canonical Wikipedia article URL */
  url: string;
};

/** First public corpus: five general whale articles on English Wikipedia. */
export const WHALE_WIKIPEDIA_SEEDS: GraphSeed[] = [
  {
    slug: "blue-whale",
    label: "Blue whale",
    url: "https://en.wikipedia.org/wiki/Blue_whale",
  },
  {
    slug: "beluga-whale",
    label: "Beluga whale",
    url: "https://en.wikipedia.org/wiki/Beluga_whale",
  },
  {
    slug: "humpback-whale",
    label: "Humpback whale",
    url: "https://en.wikipedia.org/wiki/Humpback_whale",
  },
  {
    slug: "sperm-whale",
    label: "Sperm whale",
    url: "https://en.wikipedia.org/wiki/Sperm_whale",
  },
  {
    slug: "orca",
    label: "Orca",
    url: "https://en.wikipedia.org/wiki/Orca",
  },
];
