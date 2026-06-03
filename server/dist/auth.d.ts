import { Router } from 'express';
declare module 'express-session' {
    interface SessionData {
        uid: string;
        username: string;
        linkUid: string | undefined;
    }
}
export declare function getLinkedProviders(userId: string): Promise<Array<{
    provider: string;
    email: string | null;
    displayName: string | null;
}>>;
export declare function configurePassport(): void;
export declare function createAuthRouter(): Router;
//# sourceMappingURL=auth.d.ts.map