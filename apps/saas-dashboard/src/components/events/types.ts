export type EventStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface EventTimeline {
  created:       string | null;
  activated:     string | null;
  firstWinner:   string | null;
  stockDepleted: string | null;
  lastRelease:   string | null;
  ended:         string | null;
}

export interface EventDetail {
  id:                         string;
  name:                       string;
  status:                     EventStatus;
  stockCount:                 number;
  rateLimit:                  number;
  oversubscriptionMultiplier: number;
  publicKey:                  string;
  rsaPublicKey:               string;
  signingSecret:              string;
  createdAt:                  string;
  integrationSnippet:         string;
  timeline?:                  EventTimeline;
}

export interface FunnelStats {
  totalRequests: number;
  queued:        number;
  instantWins:   number;
  soldOut:       number;
  rateLimited:   number;
  won:           number;
  released:      number;
  verified:      number;
}

export interface StatsResponse {
  live: {
    stockRemaining: number | null;
    queueDepth:     number;
    admitted:       number | null;
    queueCap:       number | null;
  };
  funnel: FunnelStats;
  rates: {
    conversionRate: number;
    releaseRate:    number;
  };
}
