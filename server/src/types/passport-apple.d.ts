declare module 'passport-apple' {
  import { Strategy } from 'passport';

  interface AppleStrategyOptions {
    clientID: string;
    teamID: string;
    keyID: string;
    privateKeyString: string;
    callbackURL: string;
    scope?: string[];
    passReqToCallback?: boolean;
  }

  type VerifyCallback = (err: Error | null, user?: any) => void;
  type VerifyFunction = (
    accessToken: string,
    refreshToken: string,
    idToken: { sub: string; email?: string; email_verified?: boolean; [key: string]: any },
    profile: any,
    done: VerifyCallback
  ) => void;

  class AppleStrategy extends Strategy {
    constructor(options: AppleStrategyOptions, verify: VerifyFunction);
  }

  export = AppleStrategy;
}
