import {
  joinLiveKitVoice, leaveLiveKitVoice, getLiveKitState, subscribeLiveKit,
  setLiveKitDead,
} from './src/services/livekitVoice';
const log: any[] = [];
subscribeLiveKit(s => log.push({ t: Date.now(), ...s }));
(window as any).__log = () => log;
(window as any).__state = () => getLiveKitState();
(window as any).__join = (id: string, room: string, alive: boolean) =>
  joinLiveKitVoice(id, room, { alive }).then(() => 'ok').catch(e => 'ERR ' + e.message);
(window as any).__dead = (d: boolean) => setLiveKitDead(d).then(() => 'ok').catch(e => 'ERR ' + e.message);
(window as any).__leave = () => leaveLiveKitVoice();
