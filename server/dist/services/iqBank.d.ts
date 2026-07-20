/**
 * VOID IQ — question bank. Original, abstract, culture-reduced cognitive items
 * across six domains. All correct answers live here on the server; the client
 * only ever receives sanitized questions (no `correctId`). Scoring is therefore
 * server-authoritative and reproducible.
 *
 * Visual questions are described by a small JSON "spec" that the client's
 * IQGlyph renderer draws as SVG — so nothing here is a copyrighted image, and
 * new item types can be added later without touching the renderer's contract.
 */
export type IQDomain = 'pattern' | 'matrix' | 'numeric' | 'logic' | 'spatial' | 'verbal';
export interface IQShape {
    t: 'poly' | 'circle' | 'ring' | 'dots' | 'arrow' | 'flag' | 'grid' | 'bars';
    sides?: number;
    rot?: number;
    fill?: boolean;
    size?: number;
    mirror?: boolean;
    n?: number;
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
}
export type IQCell = {
    shapes: IQShape[];
} | {
    empty: true;
};
export type IQVisual = {
    type: 'sequence';
    cells: IQCell[];
} | {
    type: 'matrix';
    cols: number;
    cells: IQCell[];
} | {
    type: 'analogy';
    a: IQCell;
    b: IQCell;
    c: IQCell;
} | {
    type: 'group';
    cells: IQCell[];
};
export interface IQOption {
    id: string;
    cell?: IQCell;
    text?: string;
}
export interface IQQuestion {
    id: string;
    domain: IQDomain;
    difficulty: number;
    prompt?: string;
    visual?: IQVisual;
    options: IQOption[];
    correctId: string;
}
/** What the client receives — identical minus the answer key. */
export type IQSafeQuestion = Omit<IQQuestion, 'correctId'>;
export declare const IQ_POOL: IQQuestion[];
export declare const IQ_SECTION_ORDER: IQDomain[];
export declare const IQ_DOMAIN_META: Record<IQDomain, {
    ka: string;
    key: string;
}>;
/** Assemble a full test: section order preserved, options shuffled, answers stripped. */
export declare function assembleTest(): IQSafeQuestion[];
export declare function getQuestion(id: string): IQQuestion | undefined;
export declare function totalQuestions(): number;
export declare function maxWeight(): number;
//# sourceMappingURL=iqBank.d.ts.map