import type { DilemmaScenario } from './types';
import { experienceMachine } from './scenarios/experienceMachine';

// All shipped dilemmas. New ones just get appended here.
export const DILEMMAS: DilemmaScenario[] = [experienceMachine];
