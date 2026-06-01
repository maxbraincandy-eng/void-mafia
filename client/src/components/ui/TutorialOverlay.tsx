import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const TUTORIAL_KEY = 'void_tutorial_seen';

const STEPS = [
  {
    icon: '🌃',
    title: 'WELCOME TO VOID MAFIA',
    body: 'A cyberpunk social deduction game. The city is corrupt. Find the Mafia before they eliminate everyone.',
  },
  {
    icon: '🌙',
    title: 'NIGHT PHASE',
    body: 'At night, special roles act in secret. Mafia chooses a target. Doctor saves. Sheriff investigates. Each role has unique power.',
  },
  {
    icon: '🗣️',
    title: 'DAY PHASE',
    body: 'Discuss, accuse, and vote to eliminate a suspect. Use clues, logic, and bluffing to survive. The city must find the Mafia.',
  },
];

export function TutorialOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      setVisible(true);
    }
  }, []);

  const close = () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else close();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <motion.div
            key={step}
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="w-full max-w-sm glass-panel border border-neon-cyan/30 rounded-2xl p-7 text-center"
          >
            <div className="text-5xl mb-4">{STEPS[step].icon}</div>
            <h2 className="font-display text-xl font-bold text-neon-cyan tracking-widest mb-3">
              {STEPS[step].title}
            </h2>
            <p className="font-mono text-sm text-white/60 leading-relaxed mb-6">
              {STEPS[step].body}
            </p>

            <div className="flex justify-center gap-1.5 mb-5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-neon-cyan' : 'w-1.5 bg-white/20'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="w-full py-3 rounded-xl bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan font-display font-bold tracking-widest text-sm hover:bg-neon-cyan/25 transition-all"
            >
              {step < STEPS.length - 1 ? 'NEXT →' : "LET'S PLAY"}
            </button>

            <button
              onClick={close}
              className="mt-2 w-full py-2 text-white/20 font-mono text-xs hover:text-white/40 transition-colors"
            >
              Skip tutorial
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
