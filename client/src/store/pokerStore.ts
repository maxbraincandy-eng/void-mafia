import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
import { useAuthStore } from '@/store/authStore';
import type {
  PokerChatMessage, PokerCompliance, PokerSettlement, PokerTableSummary, PokerTableView,
} from '@/types/poker';

/**
 * The poker store.
 *
 * It holds what the server sent and nothing it worked out for itself. There is
 * no local hand state, no local pot arithmetic, no "optimistic" fold. Every
 * `poker:state` replaces the table wholesale, so a client that misses a message
 * is corrected by the next one instead of drifting away from the truth.
 *
 * The one number the client owns is `actionSeq`, and it owns it only to echo it
 * back: the server refuses an action whose sequence is not the current one,
 * which is what makes a double-tap or a replayed packet a no-op.
 */

function unwrap<T>(res: any): T {
  if (!res?.ok) throw new Error(res?.error ?? 'UNKNOWN');
  return res.data as T;
}

/** Turn a server code into something a person can read. */
export function pokerErrorText(code: string): string {
  if (code.startsWith('RATE_LIMITED')) {
    const seconds = code.split(':')[1];
    return seconds ? `ცოტა დაელოდე — ${seconds} წამი` : 'ცოტა დაელოდე';
  }
  const map: Record<string, string> = {
    AUTH_REQUIRED: 'შესვლა საჭიროა',
    NO_TABLE: 'მაგიდა ვერ მოიძებნა',
    BAD_PASSWORD: 'პაროლი არასწორია',
    SEAT_TAKEN: 'ეს ადგილი დაკავებულია',
    ALREADY_SEATED: 'უკვე მაგიდასთან ხარ',
    NOT_SEATED: 'ჯერ დაჯექი მაგიდასთან',
    NOT_AT_TABLE: 'ამ მაგიდაზე არ ხარ',
    BUY_IN_TOO_SMALL: 'საწყისი სტეკი ძალიან პატარაა',
    OUT_OF_TURN: 'შენი რიგი არაა',
    SEQ_MISMATCH: 'მოძრაობა დაგვიანდა',
    HAND_MISMATCH: 'ეს დარიგება დასრულდა',
    HAS_CHIPS: 'ჯერ გაქვს ჩიპები',
    HAND_IN_PROGRESS: 'დაელოდე დარიგების დასრულებას',
    NOT_ENOUGH_PLAYERS: 'ორი მოთამაშე მაინც სჭირდება',
    CANNOT_RAISE: 'აწევა ახლა არ შეიძლება',
    BAD_ACTION: 'უცნობი მოქმედება',
    TABLE_FULL: 'მაგიდა სავსეა',
    OWNER_ONLY: 'მხოლოდ ოუნერისთვის',
    INTERNAL: 'რაღაც შეცდომაა',
  };
  return map[code] ?? code;
}

export interface PokerStore {
  table: PokerTableView | null;
  tables: PokerTableSummary[];
  compliance: PokerCompliance | null;
  chat: PokerChatMessage[];
  lastSettlement: PokerSettlement | null;
  closedReason: string | null;
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createTable: (opts?: Record<string, unknown>) => Promise<void>;
  joinTable: (code: string, password?: string) => Promise<void>;
  sit: (seat: number) => Promise<void>;
  sitOut: (out: boolean) => Promise<void>;
  rebuy: () => Promise<void>;
  leave: () => Promise<void>;
  act: (type: 'fold' | 'check' | 'call' | 'raise' | 'allIn', amount?: number) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  clearError: () => void;
  dismissClosed: () => void;

  /** Owner-only testing aids. The server checks the permission, not this. */
  addBot: () => Promise<void>;
  clearBots: () => Promise<void>;
}

const myName = () => useAuthStore.getState().profile?.username ?? 'Player';

export const usePokerStore = create<PokerStore>((set, get) => ({
  table: null,
  tables: [],
  compliance: null,
  chat: [],
  lastSettlement: null,
  closedReason: null,
  isLoading: false,
  error: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('poker:list');
      const data = unwrap<{ tables: PokerTableSummary[]; compliance: PokerCompliance }>(res);
      set({ tables: data.tables, compliance: data.compliance });
    } catch {
      // The lobby list is polled from a screen full of other games. A failure
      // here is not something the player did or can act on, so it leaves the
      // list empty rather than putting a red banner over somebody's evening.
      set({ tables: [] });
    }
  },

  createTable: async (opts = {}) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('poker:create', { name: `${myName()}ს მაგიდა`, ...opts });
      set({ table: unwrap<PokerTableView>(res), chat: [], isLoading: false, closedReason: null });
    } catch (e: any) { set({ isLoading: false, error: pokerErrorText(e.message) }); }
  },

  joinTable: async (code, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('poker:join', { code, password, name: myName() });
      set({ table: unwrap<PokerTableView>(res), chat: [], isLoading: false, closedReason: null });
    } catch (e: any) { set({ isLoading: false, error: pokerErrorText(e.message) }); }
  },

  sit: async seat => {
    const { table } = get();
    if (!table) return;
    try {
      const res = await emitWithAck<any, any>('poker:sit', { tableId: table.id, seat, name: myName() });
      set({ table: unwrap<PokerTableView>(res) });
    } catch (e: any) { set({ error: pokerErrorText(e.message) }); }
  },

  sitOut: async out => {
    const { table } = get();
    if (!table) return;
    try { await emitWithAck<any, any>('poker:sit_out', { tableId: table.id, out }); }
    catch (e: any) { set({ error: pokerErrorText(e.message) }); }
  },

  rebuy: async () => {
    const { table } = get();
    if (!table) return;
    try { await emitWithAck<any, any>('poker:rebuy', { tableId: table.id }); }
    catch (e: any) { set({ error: pokerErrorText(e.message) }); }
  },

  leave: async () => {
    const { table } = get();
    if (table) { try { await emitWithAck<any, any>('poker:leave', { tableId: table.id }); } catch { /* leaving anyway */ } }
    set({ table: null, chat: [], lastSettlement: null, closedReason: null });
  },

  /**
   * Send an action.
   *
   * `actionSeq` and `handId` come straight from the state the server last sent,
   * never from anything the client calculated. If they are stale the server
   * says so and the next `poker:state` puts this client right.
   */
  act: async (type, amount) => {
    const { table } = get();
    if (!table?.hand) return;
    try {
      await emitWithAck<any, any>('poker:action', {
        tableId: table.id,
        handId: table.hand.handId,
        actionSeq: table.actionSeq,
        type,
        amount,
      });
    } catch (e: any) {
      // A stale sequence is not worth showing: the corrected state is already
      // on its way and the player would only see a flash of red for a
      // double-tap they did not think of as an error.
      if (e.message !== 'SEQ_MISMATCH') set({ error: pokerErrorText(e.message) });
    }
  },

  sendChat: async text => {
    const { table } = get();
    if (!table || !text.trim()) return;
    try { await emitWithAck<any, any>('poker:chat', { tableId: table.id, text: text.trim() }); }
    catch (e: any) { set({ error: pokerErrorText(e.message) }); }
  },

  addBot: async () => {
    const { table } = get();
    if (!table) return;
    try { await emitWithAck<any, any>('poker:add_bot', { tableId: table.id }); }
    catch (e: any) { set({ error: e.message === 'OWNER_ONLY' ? 'მხოლოდ ოუნერისთვის' : pokerErrorText(e.message) }); }
  },

  clearBots: async () => {
    const { table } = get();
    if (!table) return;
    try { await emitWithAck<any, any>('poker:clear_bots', { tableId: table.id }); }
    catch (e: any) { set({ error: e.message === 'OWNER_ONLY' ? 'მხოლოდ ოუნერისთვის' : pokerErrorText(e.message) }); }
  },

  clearError: () => set({ error: null }),
  dismissClosed: () => set({ closedReason: null, table: null }),
}));

// ─── Server → store ──────────────────────────────────────────────────────────

socket.on('poker:state', (view: PokerTableView) => {
  const current = usePokerStore.getState().table;
  // Ignore state for a table this client has walked away from — a stale
  // broadcast must not drag someone back to a table they just left.
  if (current && current.id !== view.id) return;
  usePokerStore.setState({ table: view });
});

socket.on('poker:list_update', (tables: PokerTableSummary[]) => {
  usePokerStore.setState({ tables });
});

socket.on('poker:settlement', (payload: PokerSettlement) => {
  const table = usePokerStore.getState().table;
  if (!table || table.id !== payload.tableId) return;
  usePokerStore.setState({ lastSettlement: payload });
});

socket.on('poker:hand_start', () => {
  // A new hand clears the previous result rather than letting it linger over
  // the felt while the next one is being dealt.
  usePokerStore.setState({ lastSettlement: null });
});

socket.on('poker:chat', (message: PokerChatMessage) => {
  const table = usePokerStore.getState().table;
  if (!table || table.id !== message.tableId) return;
  usePokerStore.setState(state => ({ chat: [...state.chat, message].slice(-60) }));
});

socket.on('poker:closed', (payload: { tableId: string; reason: string }) => {
  const table = usePokerStore.getState().table;
  if (!table || table.id !== payload.tableId) return;
  usePokerStore.setState({ closedReason: payload.reason });
});

socket.on('poker:error', (payload: { code: string }) => {
  if (payload?.code === 'SEQ_MISMATCH') return;
  usePokerStore.setState({ error: pokerErrorText(payload?.code ?? 'INTERNAL') });
});

/**
 * Reconnect.
 *
 * A new socket means the server was holding a dead handle for this client, and
 * the table would sit frozen until it asked. `poker:resume` answers with
 * authoritative state for every table this identity is actually at — the seat
 * is held by the server's grace period, not by anything remembered here.
 */
registerMatchResume<{ tables: PokerTableView[] }>('poker:resume', data => {
  const tables = data?.tables ?? [];
  if (tables.length === 0) {
    // Nothing to come back to: the table closed, or the seat was released.
    if (usePokerStore.getState().table) usePokerStore.setState({ table: null });
    return;
  }
  const current = usePokerStore.getState().table;
  const mine = tables.find(t => t.id === current?.id) ?? tables[0]!;
  usePokerStore.setState({ table: mine });
});
