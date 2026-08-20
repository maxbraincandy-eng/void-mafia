export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';
export type Rank = 0 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card { suit: Suit; rank: Rank; }

export interface PlayedCard {
  playerId: string;
  seatIndex: number;
  card: Card;
  jokerTarget?: string;
}

export interface JokerPlayerPublic {
  id: string;
  socketId: string;
  name: string;
  profileId: string | null;
  seatIndex: number;
  cardCount: number;
  isBot?: boolean;
  avatar?: string;
  avatarUrl?: string | null;
}

export interface JokerSettings {
  mode: 'classic' | 'nines_only';
  bonusEnabled: boolean;
  spectatorsAllowed: boolean;
  privateTable: boolean;
}

export interface JokerRoundResult {
  roundIndex: number;
  cardCount: number;
  trumpSuit: Suit | null;
  declarations: Record<string, number>;
  taken: Record<string, number>;
  points: Record<string, number>;
  khishtiPlayers: string[];
  pulkaId: number | null;
  /** Best deal of the pulka, doubled for a player who kept every word in it. */
  premiumPlayers: Record<string, number>;
  /** …and erased for everyone else. */
  premiumPenalties: Record<string, number>;
}

export interface JokerChatMsg {
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
}

export interface JokerMatchPublic {
  id: string;
  code: string;
  status: 'waiting' | 'declaration' | 'playing' | 'round_end' | 'finished';
  settings: JokerSettings;
  players: JokerPlayerPublic[];
  spectatorCount: number;
  botPlayerIds: string[];
  roundPlan: number[];
  pulkaIds: (number | null)[];
  currentRoundIndex: number;
  totalRounds: number;
  currentDealerSeat: number;
  declarations: Record<string, number | null>;
  currentDeclarationSeat: number;
  tricksTaken: Record<string, number>;
  /** ხიშტი for this deal — null means უხიშტოდ. */
  trumpSuit: Suit | null;
  /** The seat that names it: the first to declare this deal. */
  trumpChooserSeat: number;
  /** Over-called (tear) or under-called (stuff), and by how much. */
  bidTension: { sum: number; diff: number; kind: 'tear' | 'stuff' | 'even' };
  /** The one bid the last declarer may not make (null until their turn). */
  forbiddenBid: number | null;
  currentTrick: PlayedCard[];
  currentPlaySeat: number;
  scores: Record<string, number>;
  roundHistory: JokerRoundResult[];
  chat: JokerChatMsg[];
  winnerPlayerId: string | null;
  // Injected client-side:
  myPlayerId: string | null;
  mySeatIndex: number | null;
}

export interface JokerMatchListItem {
  id: string;
  code: string;
  status: string;
  mode: string;
  playerNames: string[];
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
}
