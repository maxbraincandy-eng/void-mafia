import { useEffect } from 'react';
import { useWWWStore } from '@/store/wwwStore';
import { useAuthStore } from '@/store/authStore';
import { useWWWVoice } from '@/hooks/useWWWVoice';
import { WWWVoiceBar } from './WWWVoiceBar';
import { WWWLobby } from './WWWLobby';
import { WWWQuestionCard } from './WWWQuestionCard';
import { WWWFinish } from './WWWFinish';

export function WWWGame() {
  const {
    match,
    leaveMatch,
    joinTeam,
    assignCaptain,
    startMatch,
    advanceDiscussion,
    submitAnswer,
    judgeAnswer,
    nextQuestion,
    sendChat,
  } = useWWWStore();

  const myUserId = useAuthStore(s => s.profile?.id ?? '') || '';
  const voice = useWWWVoice();

  useEffect(() => {
    if (match && !voice.joined && voice.status !== 'requesting' && voice.status !== 'connecting') {
      const myPlayer = match.players[myUserId];
      if (myPlayer) {
        if (myPlayer.role === 'spectator') {
          voice.joinListen(match.id);
        } else {
          voice.joinVoice(match.id);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  useEffect(() => {
    return () => {
      voice.leave();
      leaveMatch();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#03000d' }}>
      <WWWVoiceBar voice={voice} matchId={match.id} />

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {match.status === 'waiting' && (
          <WWWLobby
            match={match}
            myUserId={myUserId}
            voice={voice}
            onJoinTeam={joinTeam}
            onAssignCaptain={assignCaptain}
            onStart={startMatch}
            onLeave={leaveMatch}
          />
        )}

        {['question', 'discussion', 'answering', 'judging', 'round_result'].includes(match.status) && (
          <WWWQuestionCard
            match={match}
            myUserId={myUserId}
            voice={voice}
            onAdvanceDiscussion={advanceDiscussion}
            onSubmitAnswer={submitAnswer}
            onJudge={judgeAnswer}
            onNextQuestion={nextQuestion}
            onLeave={leaveMatch}
            onChat={sendChat}
          />
        )}

        {match.status === 'finished' && (
          <WWWFinish
            match={match}
            myUserId={myUserId}
            onLeave={leaveMatch}
          />
        )}
      </div>
    </div>
  );
}
