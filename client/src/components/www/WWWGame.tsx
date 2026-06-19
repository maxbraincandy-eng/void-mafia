import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useWWWStore } from '@/store/wwwStore';
import { useWWWVoice } from '@/hooks/useWWWVoice';
import { useAuthStore } from '@/store/authStore';
import { WWWLobby } from './WWWLobby';
import { WWWQuestionCard } from './WWWQuestionCard';
import { WWWFinish } from './WWWFinish';

export function WWWGame() {
  const {
    match, leaveMatch, joinTeam, assignCaptain, startMatch,
    advanceDiscussion, submitAnswer, judgeAnswer, nextQuestion, sendChat,
  } = useWWWStore();
  const myUserId = useAuthStore(s => s.profile?.id ?? '');
  const voice = useWWWVoice();

  const myPlayer = match?.players[myUserId];

  useEffect(() => {
    return () => {
      voice.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!match) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: '#03000d' }}
    >
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
      {['question', 'discussion', 'judging', 'round_result'].includes(match.status) && (
        <WWWQuestionCard
          match={match}
          myUserId={myUserId}
          voice={voice}
          onAdvanceDiscussion={advanceDiscussion}
          onSubmitAnswer={submitAnswer}
          onJudge={(teamId, isCorrect) => judgeAnswer(teamId, isCorrect)}
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
    </motion.div>
  );
}
